/* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";

// import React, { useState } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "../components/ui/dialog"; // adjust path if needed
// import { Input } from "../components/ui/input";
// import { Textarea } from "../components/ui/textarea";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
// import { Button } from "../components/ui/button";

// const CreateInterview: React.FC = () => {
//   const [formData, setFormData] = useState({
//     title: "",
//     description: "",
//     difficulty: "Easy",
//     interviewDate: "",
//     interviewTime: "",
//   });

//   const handleChange = (
//     e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
//   ) => {
//     const { name, value } = e.target;
//     setFormData((prev) => ({ ...prev, [name]: value }));
//   };

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     try {
//       const res = await fetch("http://localhost:5000/api/interviews/create-interview", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(formData),
//       });
//       const data = await res.json();
//       console.log("Interview created:", data);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   return (
//     <Dialog>
//       <DialogTrigger asChild>
//         <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-md transition">
//           Create Interview
//         </Button>
//       </DialogTrigger>
//       <DialogContent className="bg-white sm:max-w-[500px] rounded-2xl p-6 shadow-lg">
//   <DialogHeader>
//     <DialogTitle className="text-gray-900 text-xl font-bold">Create Interview</DialogTitle>
//   </DialogHeader>

//   <form onSubmit={handleSubmit} className="grid gap-4 mt-4">
//     {/* Title */}
//     <div className="flex flex-col">
//       <label htmlFor="title" className="text-sm font-medium text-gray-700">
//         Title
//       </label>
//       <Input
//         id="title"
//         name="title"
//         value={formData.title}
//         onChange={handleChange}
//         placeholder="Enter interview title"
//         required
//         className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg"
//       />
//     </div>

//     {/* Description */}
//     <div className="flex flex-col">
//       <label htmlFor="description" className="text-sm font-medium text-gray-700">
//         Description
//       </label>
//       <Textarea
//         id="description"
//         name="description"
//         value={formData.description}
//         onChange={handleChange}
//         placeholder="Enter description"
//         className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg resize-none"
//       />
//     </div>

//     {/* Difficulty */}
//     <div className="flex flex-col">
//       <label htmlFor="difficulty" className="text-sm font-medium text-gray-700">
//         Difficulty
//       </label>
//       <Select
//         value={formData.difficulty}
//         onValueChange={(value: string) =>
//           setFormData((prev) => ({ ...prev, difficulty: value }))
//         }
//       >
//         <SelectTrigger className="mt-1 bg-gray text-gray-900 border border-gray-300 rounded-lg">
//           <SelectValue placeholder="Select difficulty" />
//         </SelectTrigger>
//         <SelectContent>
//           <SelectItem value="Beginner">Beginner</SelectItem>
//           <SelectItem value="Intermediate">Intermediate</SelectItem>
//           <SelectItem value="Advanced">Advanced</SelectItem>
//         </SelectContent>
//       </Select>
//     </div>

//     {/* Date & Time */}
//     <div className="flex gap-4">
//       <div className="flex flex-col flex-1">
//         <label htmlFor="interviewDate" className="text-sm font-medium text-gray-700">
//           Interview Date
//         </label>
//         <Input
//           type="date"
//           id="interviewDate"
//           name="interviewDate"
//           value={formData.interviewDate}
//           onChange={handleChange}
//           required
//           className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg"
//         />
//       </div>
//       <div className="flex flex-col flex-1">
//         <label htmlFor="interviewTime" className="text-sm font-medium text-gray-700">
//           Interview Time
//         </label>
//         <Input
//           type="time"
//           id="interviewTime"
//           name="interviewTime"
//           value={formData.interviewTime}
//           onChange={handleChange}
//           required
//           className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg"
//         />
//       </div>
//     </div>

//     {/* Buttons */}
//     <div className="flex justify-end gap-2 mt-4">
//       <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2">
//         Create
//       </Button>
//     </div>
//   </form>
// </DialogContent>

//     </Dialog>
//   );
// };

// export default CreateInterview;




"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Button } from "../components/ui/button";


const CreateInterview: React.FC = () => {
  const [questions, setQuestions] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    difficulty: "Beginner",
    interviewDate: "",
    interviewTime: "",
  });
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null); // clear error when user starts typing again
  };

  // Submit interview form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend validation
    if (!formData.title.trim()) return setError("Title is required.");
    if (!formData.interviewDate || !formData.interviewTime)
      return setError("Please select date and time.");

    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:5000/api/create-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, generatedQuestions: questions }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create interview");
      }

      const data = await res.json();
      console.log("Interview created:", data);
      // Optional: Reset form after success
      setFormData({
        title: "",
        description: "",
        difficulty: "Beginner",
        interviewDate: "",
        interviewTime: "",
      });
      setQuestions([]);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Generate questions from backend
  const handleGenerateQuestions = async () => {
    setError(null);
    setLoadingQuestions(true);
    try {
      if (!formData.title.trim() || !formData.description.trim()) {
        throw new Error("Please enter title and description before generating questions.");
      }

      const res = await fetch(
        "http://localhost:5000/api/interviews/generate-questions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            difficulty: formData.difficulty,
            title: formData.title,
            description: formData.description,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to generate questions");
      }

      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        setQuestions([]);
        setError("No questions generated. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate questions.");
    } finally {
      setLoadingQuestions(false);
    }
  };

  return (
    <Dialog >
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl shadow-md transition">
          Create Interview
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-white sm:max-w-[600px] max-h-[600px] overflow-y-scroll rounded-2xl p-6 shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-gray-900 text-xl font-bold">
            Create Interview
          </DialogTitle>
        </DialogHeader>

        {/* Error alert */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 mt-4">
          {/* Title */}
          <div className="flex flex-col">
            <label htmlFor="title" className="text-sm font-medium text-gray-700">
              Title
            </label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Enter interview title"
              required
              className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col">
            <label
              htmlFor="description"
              className="text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter description"
              className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg resize-none"
            />
          </div>

          {/* Difficulty */}
          <div className="flex flex-col">
            <label
              htmlFor="difficulty"
              className="text-sm font-medium text-gray-700"
            >
              Difficulty
            </label>
            <Select
              value={formData.difficulty}
              onValueChange={(value: string) =>
                setFormData((prev) => ({ ...prev, difficulty: value }))
              }
            >
              <SelectTrigger className="mt-1 bg-gray text-gray-900 border border-gray-300 rounded-lg">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Beginner">Beginner</SelectItem>
                <SelectItem value="Intermediate">Intermediate</SelectItem>
                <SelectItem value="Advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generate Questions */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              Generate Questions
            </label>
            <Button
              type="button"
              onClick={handleGenerateQuestions}
              className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2"
              disabled={loadingQuestions}
            >
              {loadingQuestions ? "Generating..." : "Generate 10 Questions"}
            </Button>

            {questions.length > 0 && (
              <ul className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-60 overflow-auto space-y-2">
                {questions.map((q, index) => (
                  <li
                    key={index}
                    className="text-sm text-gray-800 bg-white border border-gray-200 rounded-md p-2 shadow-sm"
                  >
                    {index + 1}. {q}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Date & Time */}
          <div className="flex gap-4">
            <div className="flex flex-col flex-1">
              <label
                htmlFor="interviewDate"
                className="text-sm font-medium text-gray-700"
              >
                Interview Date
              </label>
              <Input
                type="date"
                id="interviewDate"
                name="interviewDate"
                value={formData.interviewDate}
                onChange={handleChange}
                required
                className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg"
              />
            </div>
            <div className="flex flex-col flex-1">
              <label
                htmlFor="interviewTime"
                className="text-sm font-medium text-gray-700"
              >
                Interview Time
              </label>
              <Input
                type="time"
                id="interviewTime"
                name="interviewTime"
                value={formData.interviewTime}
                onChange={handleChange}
                required
                className="mt-1 bg-gray-50 text-gray-900 border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2"
            >
              {submitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateInterview;

