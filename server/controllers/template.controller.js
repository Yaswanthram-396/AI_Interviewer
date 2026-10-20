const { TEMPLATE_STATUSES } = require("../interviews/templates/constants");
const { hasRole, ROLES } = require("../auth/policies");

const NOT_FOUND = { success: false, message: "Interview template not found" };

/**
 * Read and manage interview templates. Reading a template is open to any signed-in user (when auth is enforced);
 * the question bank, which carries the evaluator's answer key, and all writes are restricted by the routes.
 */
function createTemplateController({ service }) {
  const fail = (res, error, label) => {
    console.error(`${label}:`, error.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  };
  const isCandidate = (req) => !!req.user && hasRole(req.user, ROLES.CANDIDATE);
  // Candidates only ever see active templates; managers (and the open, unenforced mode) see every status.
  const sees = (req, template) => !isCandidate(req) || template.status === "active";

  const list = async (req, res) => {
    try {
      res.status(200).json({ success: true, templates: await service.list({ includeInactive: !isCandidate(req) }) });
    } catch (error) {
      fail(res, error, "Error listing interview templates");
    }
  };

  const get = async (req, res) => {
    try {
      const template = await service.get(req.params.ref, { withBankSize: !isCandidate(req) });
      if (!template || !sees(req, template)) return res.status(404).json(NOT_FOUND);
      res.status(200).json({ success: true, template });
    } catch (error) {
      fail(res, error, "Error fetching interview template");
    }
  };

  const topics = async (req, res) => {
    try {
      const template = await service.get(req.params.ref);
      if (!template || !sees(req, template)) return res.status(404).json(NOT_FOUND);
      res.status(200).json({ success: true, topics: template.topics });
    } catch (error) {
      fail(res, error, "Error fetching template topics");
    }
  };

  const questions = async (req, res) => {
    try {
      const page = await service.questions(req.params.ref, req.params.topicId, { difficulty: req.query.difficulty, type: req.query.type, page: req.query.page, limit: req.query.limit });
      if (!page) return res.status(404).json(NOT_FOUND);
      res.status(200).json({ success: true, ...page });
    } catch (error) {
      fail(res, error, "Error fetching template questions");
    }
  };

  const create = async (req, res) => {
    try {
      const result = await service.create(req.body);
      if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
      res.status(201).json({ success: true, template: result.template });
    } catch (error) {
      fail(res, error, "Error creating interview template");
    }
  };

  const update = async (req, res) => {
    try {
      const status = req.body?.status;
      if (status !== undefined && !TEMPLATE_STATUSES.includes(status)) return res.status(400).json({ success: false, message: `status must be one of ${TEMPLATE_STATUSES.join(", ")}` });
      const result = await service.update(req.params.ref, req.body, { status });
      if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
      res.status(200).json({ success: true, template: result.template });
    } catch (error) {
      fail(res, error, "Error updating interview template");
    }
  };

  return { list, get, topics, questions, create, update };
}

module.exports = { createTemplateController };
