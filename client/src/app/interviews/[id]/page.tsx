"use client";
import InterviewBot from "@/app/components/interviewBot";
import { useParams } from "next/navigation";

const AttemptInterview = () => {
    const { id } = useParams();
    // Ensure id is always a string
    return <InterviewBot id={typeof id === "string" ? id : ""} />;
}
export default AttemptInterview