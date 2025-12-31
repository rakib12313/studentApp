
// Data Models

export interface Student {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: 'active' | 'banned';
    avatar?: string;
    joinedAt: string;
    isOnline: boolean;
}

export interface Notice {
    id: string;
    content: string;
    timestamp: string;
    active: boolean;
}

export interface LibraryItem {
    id: string;
    title: string;
    subject: string;
    type: 'pdf' | 'image';
    url: string; // Base64 or URL
    allowDownload: boolean;
    addedAt: string;
}

export interface Question {
    id: string;
    subject: string;
    question: string;
    options: string[];
    answer: string;
    hint?: string;
}

export interface Exam {
    id: string;
    title: string;
    durationMinutes: number;
    type: 'mcq' | 'file'; // file means PDF/Image question paper
    questions: Question[];
    fileUrl?: string; // If type is file
    status: 'draft' | 'published' | 'ended';
    participants: number;
}

export interface ExamResult {
    id: string;
    examId: string;
    examTitle: string;
    studentId: string;
    studentName: string;
    score: number;
    totalScore: number;
    date: string;
    status: 'passed' | 'failed' | 'needs_check';
    answers: Record<string, string>; // Stores questionID: selectedOption
}

// Global State Interface
export interface AppState {
    students: Student[];
    notices: Notice[];
    library: LibraryItem[];
    exams: Exam[];
    results: ExamResult[];
}
