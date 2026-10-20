const mongoose = require("mongoose");
const { canManageInterview, canViewInterview, interviewScope, forCandidate, hasRole, ROLES } = require("../auth/policies");
const { normalizeSettings, normalizeAssignees, randomCode } = require("../interviews/settings");
const { interviewSettingsFromSnapshot, interviewDifficulty } = require("../interviews/templates/snapshot");

const NOT_FOUND = { success: false, message: "Interview not found" };
const validId = (id) => mongoose.Types.ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(String(id));
const bad = (res, message) => res.status(400).json({ success: false, message });
const STATUSES = ["draft", "active", "archived"]; // "completed" is derived, never set by a client

/**
 * Interview REST handlers. `req.user` is set only when auth is enforced; without it the
 * legacy anonymous behavior is preserved (rollout flag, see docs/auth-design.md).
 * Ownership is applied inside the query, and unauthorized single-resource access is a 404.
 * A candidate only ever receives their own assignment, never the other candidates.
 */
function createInterviewController({ Interview, authService, templates = null }) {
  /** Shape a stored interview for the caller. */
  const present = (req, interview) => (req.user && hasRole(req.user, ROLES.CANDIDATE) ? forCandidate(req.user, interview) : interview);
  const fail = (res, error, label) => {
    console.error(`${label}:`, error.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  };

  /** Loads an interview the caller may manage, or answers 404. */
  async function loadManaged(req, res) {
    if (!validId(req.params.id)) return void res.status(404).json(NOT_FOUND);
    const interview = await Interview.findById(req.params.id).lean();
    if (!interview || (req.user && !canManageInterview(req.user, interview))) return void res.status(404).json(NOT_FOUND);
    return interview;
  }

  const createInterview = async (req, res) => {
    try {
      let body = req.body || {};
      // From a template: the template supplies the topics, question counts, follow-up limit and duration.
      let template = null;
      if (body.templateId !== undefined) {
        if (!templates) return bad(res, "Interview templates are not available");
        template = await templates.snapshot(body.templateId);
        if (!template) return res.status(404).json({ success: false, message: "Interview template not found or not active" });
        body = {
          ...body,
          title: body.title || template.title,
          description: body.description ?? String(template.description || "").slice(0, 500),
          difficulty: interviewDifficulty(template),
          timeLimit: template.durationMinutes,
          settings: interviewSettingsFromSnapshot(template),
        };
      }
      const { title, description, difficulty, timeLimit } = body;
      if (!title) return bad(res, "Title is required");
      const status = body.status === undefined ? "active" : body.status;
      if (!["draft", "active"].includes(status)) return bad(res, "status must be draft or active");
      const settings = normalizeSettings(body.settings, { publishing: status === "active" && body.settings !== undefined });
      if (!settings.ok) return bad(res, settings.message);
      const assignees = normalizeAssignees(body.assignments);
      if (!assignees.ok) return bad(res, assignees.message);
      const minutes = Number(timeLimit);

      let saved;
      for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
        const interview = new Interview({
          title,
          description,
          difficulty,
          status,
          code: randomCode(),
          settings: settings.value,
          ...(template && { templateId: template.templateId }),
          assignments: assignees.value,
          // Only a sane duration is stored; anything else is ignored rather than failing the create.
          ...(Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 && { timeLimit: minutes }),
          ownerId: req.user?.id,
        });
        try {
          await interview.save();
          saved = interview;
        } catch (error) {
          if (error?.code !== 11000 || attempt === 3) throw error; // retry only on a code collision
        }
      }
      res.status(201).json({ success: true, message: "Interview created successfully", interview: saved });
    } catch (error) {
      if (error?.name === "ValidationError") return bad(res, Object.values(error.errors || {})[0]?.message || "Invalid interview");
      fail(res, error, "Error creating interview");
    }
  };

  const getInterviews = async (req, res) => {
    try {
      let filter = {};
      if (req.user) {
        filter = interviewScope(req.user);
        if (!filter) return res.status(403).json({ success: false, message: "Not allowed" });
      }
      const interviews = await Interview.find(filter).lean();
      res.status(200).json({ success: true, interviews: interviews.map((interview) => present(req, interview)) });
    } catch (error) {
      fail(res, error, "Error fetching interviews");
    }
  };

  const getInterview = async (req, res) => {
    try {
      if (!validId(req.params.id)) return res.status(404).json(NOT_FOUND);
      const interview = await Interview.findById(req.params.id).lean();
      if (!interview || (req.user && !canViewInterview(req.user, interview))) return res.status(404).json(NOT_FOUND);
      res.status(200).json({ success: true, interview: present(req, interview) });
    } catch (error) {
      fail(res, error, "Error fetching interview");
    }
  };

  /** Edits an interview: details, settings, and publish/draft/archive status. */
  const updateInterview = async (req, res) => {
    try {
      const interview = await loadManaged(req, res);
      if (!interview) return;
      const body = req.body || {};
      const patch = {};
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || body.title.trim().length < 5 || body.title.length > 100) return bad(res, "Title must be 5-100 characters");
        patch.title = body.title.trim();
      }
      if (body.description !== undefined) {
        if (typeof body.description !== "string" || body.description.length > 500) return bad(res, "Description cannot exceed 500 characters");
        patch.description = body.description;
      }
      if (body.difficulty !== undefined) {
        if (!["Beginner", "Intermediate", "Advanced"].includes(body.difficulty)) return bad(res, "Invalid difficulty");
        patch.difficulty = body.difficulty;
      }
      if (body.timeLimit !== undefined) {
        const minutes = Number(body.timeLimit);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return bad(res, "timeLimit must be 1-240 minutes");
        patch.timeLimit = minutes;
      }
      const status = body.status ?? interview.status ?? "active";
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) return bad(res, "status must be draft, active or archived");
        patch.status = body.status;
      }
      // A template interview takes its topics, counts and follow-up limit from the template: edit the template instead.
      if (interview.templateId && body.settings !== undefined) return res.status(409).json({ success: false, message: "This interview's settings come from its template" });
      const incoming = body.settings !== undefined ? body.settings : interview.settings;
      if (body.settings !== undefined || (status === "active" && interview.status === "draft")) {
        const settings = normalizeSettings(incoming, { publishing: status === "active" && incoming !== undefined });
        if (!settings.ok) return bad(res, settings.message);
        patch.settings = settings.value;
      }
      if (Object.keys(patch).length === 0) return bad(res, "Nothing to update");
      await Interview.updateOne({ _id: interview._id }, { $set: patch });
      res.status(200).json({ success: true, interview: { ...interview, ...patch } });
    } catch (error) {
      fail(res, error, "Error updating interview");
    }
  };

  /** Adds candidates (by email). Adding someone already assigned is a harmless no-op. */
  const addAssignments = async (req, res) => {
    try {
      const interview = await loadManaged(req, res);
      if (!interview) return;
      if (interview.status === "archived") return bad(res, "Archived interviews cannot be assigned");
      const list = req.body?.assignments ?? (req.body?.email ? [req.body] : undefined);
      const assignees = normalizeAssignees(list, interview.assignments || []);
      if (!assignees.ok) return bad(res, assignees.message);
      if ((interview.assignments || []).length + assignees.value.length > 200) return bad(res, "An interview can have at most 200 candidates");
      if (assignees.value.length) await Interview.updateOne({ _id: interview._id }, { $push: { assignments: { $each: assignees.value } } });
      const updated = await Interview.findById(interview._id).lean();
      res.status(200).json({ success: true, added: assignees.value.length, interview: updated });
    } catch (error) {
      fail(res, error, "Error assigning candidates");
    }
  };

  /** A candidate can be removed only before they have started. */
  const removeAssignment = async (req, res) => {
    try {
      const interview = await loadManaged(req, res);
      if (!interview) return;
      const assignment = (interview.assignments || []).find((a) => String(a._id) === String(req.params.assignmentId));
      if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
      if (assignment.status !== "invited" && assignment.status !== "not_started") return res.status(409).json({ success: false, message: "This candidate has already started" });
      await Interview.updateOne({ _id: interview._id }, { $pull: { assignments: { _id: assignment._id } } });
      res.status(200).json({ success: true });
    } catch (error) {
      fail(res, error, "Error removing assignment");
    }
  };

  // Binds a registered candidate account directly (original flow; invitations by email supersede it).
  const assignCandidate = async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
      if (!validId(req.params.id)) return res.status(404).json(NOT_FOUND);
      const interview = await Interview.findById(req.params.id).lean();
      if (!interview || !canManageInterview(req.user, interview)) return res.status(404).json(NOT_FOUND);
      const candidate = await authService.findUserByEmail(req.body?.candidateEmail);
      if (!candidate || candidate.role !== ROLES.CANDIDATE) {
        return res.status(404).json({ success: false, message: "No candidate account with that email" });
      }
      await Interview.updateOne({ _id: interview._id }, { $set: { candidateId: candidate.id } });
      res.status(200).json({ success: true, candidateId: candidate.id });
    } catch (error) {
      fail(res, error, "Error assigning candidate");
    }
  };

  return { createInterview, getInterviews, getInterview, updateInterview, addAssignments, removeAssignment, assignCandidate };
}

module.exports = { createInterviewController };
