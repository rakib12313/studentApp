import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { 
    LayoutDashboard, Users, FileText, BookOpen, Bell, 
    LogOut, Plus, Trash2, Search, CheckCircle, XCircle, 
    Upload, Save, ChevronRight, AlertTriangle, Play, Settings,
    Eye, Check, X
} from 'lucide-react';
import { Card, Button, Input, Select, Modal, Badge, ProgressBar } from './components/UI';
import { AppState, Student, Exam, Question, LibraryItem, Notice, ExamResult } from './types';
import { auth, db, uploadToCloudinary } from './services';
import { ref, onValue, set, update, push, remove } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';

const AdminApp: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [state, setState] = useState<AppState>({ students: [], notices: [], library: [], exams: [], results: [] });
    const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'exams' | 'library' | 'notices'>('dashboard');

    useEffect(() => {
        onAuthStateChanged(auth, setUser);
    }, []);

    useEffect(() => {
        if (!user) return;
        const dbRef = ref(db);
        return onValue(dbRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setState({
                    students: data.students ? Object.values(data.students) : [],
                    notices: data.notices ? Object.values(data.notices) : [],
                    library: data.library ? Object.values(data.library) : [],
                    exams: data.exams ? Object.values(data.exams) : [],
                    results: data.results ? Object.values(data.results) : []
                });
            }
        });
    }, [user]);

    if (!user) return <LoginScreen />;

    return (
        <div className="min-h-screen flex bg-[#050507] text-white font-sans">
            {/* Sidebar */}
            <div className="w-64 bg-[#0a0a0e] border-r border-white/5 flex flex-col p-6 fixed h-full z-20">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-amber-500 rounded-xl flex items-center justify-center font-bold text-xl">A</div>
                    <h1 className="font-heading font-bold text-lg tracking-wide">Admin Console</h1>
                </div>

                <nav className="space-y-2 flex-1">
                    <SidebarItem icon={<LayoutDashboard />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                    <SidebarItem icon={<Users />} label="Students" active={activeTab === 'students'} onClick={() => setActiveTab('students')} />
                    <SidebarItem icon={<FileText />} label="Exams" active={activeTab === 'exams'} onClick={() => setActiveTab('exams')} />
                    <SidebarItem icon={<BookOpen />} label="Library" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
                    <SidebarItem icon={<Bell />} label="Notices" active={activeTab === 'notices'} onClick={() => setActiveTab('notices')} />
                </nav>

                <button onClick={() => signOut(auth)} className="flex items-center gap-3 text-gray-500 hover:text-red-400 p-3 rounded-xl hover:bg-red-500/10 transition-colors">
                    <LogOut size={20} /> <span className="text-sm font-medium">Logout</span>
                </button>
            </div>

            {/* Main Content */}
            <main className="ml-64 flex-1 p-8 max-w-7xl mx-auto">
                {activeTab === 'dashboard' && <Dashboard state={state} />}
                {activeTab === 'students' && <StudentsManager students={state.students} />}
                {activeTab === 'exams' && <ExamsManager exams={state.exams} />}
                {activeTab === 'library' && <LibraryManager library={state.library} />}
                {activeTab === 'notices' && <NoticesManager notices={state.notices} />}
            </main>
        </div>
    );
};

// --- Sub-Components ---

const Dashboard = ({ state }: { state: AppState }) => {
    const activeStudents = state.students.filter(s => s.status === 'active').length;
    const pendingResults = state.results.filter(r => r.status === 'needs_check').length;
    const [inspectResult, setInspectResult] = useState<{ result: ExamResult, exam: Exam | undefined } | null>(null);

    const openInspection = (res: ExamResult) => {
        const exam = state.exams.find(e => e.id === res.examId);
        setInspectResult({ result: res, exam });
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <h2 className="text-3xl font-heading font-bold">Overview</h2>
            <div className="grid grid-cols-4 gap-6">
                <StatCard icon={<Users />} label="Total Students" value={state.students.length} color="bg-blue-500" />
                <StatCard icon={<CheckCircle />} label="Active Users" value={activeStudents} color="bg-emerald-500" />
                <StatCard icon={<FileText />} label="Active Exams" value={state.exams.filter(e => e.status === 'published').length} color="bg-purple-500" />
                <StatCard icon={<AlertTriangle />} label="Pending Reviews" value={pendingResults} color="bg-amber-500" />
            </div>

            <div className="grid grid-cols-2 gap-6">
                <Card title="Recent Activity" subtitle="Click a result to view detailed answers">
                    <div className="space-y-4">
                        {state.results.slice(-5).reverse().map(r => (
                            <div key={r.id} onClick={() => openInspection(r)} className="flex justify-between items-center text-sm p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors group">
                                <div>
                                    <span className="font-bold block text-purple-300 group-hover:text-purple-200">{r.studentName}</span>
                                    <span className="text-gray-400 text-xs">Completed: {r.examTitle}</span>
                                </div>
                                <Badge variant={r.status === 'passed' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{r.score}/{r.totalScore}</Badge>
                            </div>
                        ))}
                        {state.results.length === 0 && <p className="text-gray-500">No recent activity.</p>}
                    </div>
                </Card>
                <Card title="System Status">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Database Connection</span>
                            <Badge variant="success">ONLINE</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Library Storage</span>
                            <Badge variant="info">{state.library.length} Files</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Total Exams Created</span>
                            <Badge variant="neutral">{state.exams.length}</Badge>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Inspection Modal */}
            <Modal isOpen={!!inspectResult} onClose={() => setInspectResult(null)} title="Exam Result Inspection">
                {inspectResult && (
                    <div className="space-y-6">
                         <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                            <div>
                                <h3 className="font-bold text-lg">{inspectResult.result.studentName}</h3>
                                <p className="text-xs text-gray-400">{inspectResult.result.examTitle}</p>
                            </div>
                            <div className="text-right">
                                <span className="block text-2xl font-bold">{inspectResult.result.score} / {inspectResult.result.totalScore}</span>
                                <Badge variant={inspectResult.result.status === 'passed' ? 'success' : 'danger'}>{inspectResult.result.status}</Badge>
                            </div>
                        </div>

                        {inspectResult.exam ? (
                            <div className="space-y-4">
                                {inspectResult.exam.questions.map((q, idx) => {
                                    const userAnswer = inspectResult.result.answers ? inspectResult.result.answers[q.id] : null;
                                    const isCorrect = userAnswer === q.answer;
                                    
                                    return (
                                        <div key={q.id} className={`p-4 rounded-xl border ${isCorrect ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-1 p-1 rounded-full ${isCorrect ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>
                                                    {isCorrect ? <Check size={12}/> : <X size={12}/>}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-sm text-gray-200 mb-2">Q{idx + 1}: {q.question}</p>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div className={`p-2 rounded ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            <span className="block opacity-60 uppercase font-bold text-[10px]">Student Answer</span>
                                                            {userAnswer || '(No Answer)'}
                                                        </div>
                                                        <div className="p-2 rounded bg-white/5 text-gray-300">
                                                            <span className="block opacity-60 uppercase font-bold text-[10px]">Correct Answer</span>
                                                            {q.answer}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 p-8">Exam data definition is missing or deleted.</div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

const StudentsManager = ({ students }: { students: Student[] }) => {
    const [search, setSearch] = useState('');
    const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));

    const toggleBan = (s: Student) => {
        const newStatus = s.status === 'active' ? 'banned' : 'active';
        if(confirm(`Are you sure you want to ${newStatus.toUpperCase()} ${s.name}?`)) {
            update(ref(db, `students/${s.id}`), { status: newStatus });
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-heading font-bold">Students</h2>
                <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-500" size={16} />
                    <input className="glass-input pl-10 rounded-xl" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>
            
            <div className="glass-panel rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-white/5 text-xs uppercase text-gray-400 font-bold">
                        <tr>
                            <th className="p-4">Name</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Joined</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filtered.map(s => (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 flex items-center gap-3">
                                    <img src={s.avatar || `https://ui-avatars.com/api/?name=${s.name}`} className="w-8 h-8 rounded-full bg-gray-700" />
                                    <span className="font-medium">{s.name}</span>
                                </td>
                                <td className="p-4 text-gray-400">{s.email}</td>
                                <td className="p-4 text-gray-500 text-sm">{s.joinedAt}</td>
                                <td className="p-4">
                                    <Badge variant={s.status === 'active' ? 'success' : 'danger'}>{s.status}</Badge>
                                </td>
                                <td className="p-4 text-right">
                                    <Button size="sm" variant={s.status === 'active' ? 'danger' : 'success'} onClick={() => toggleBan(s)}>
                                        {s.status === 'active' ? 'Ban Access' : 'Unban'}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className="p-8 text-center text-gray-500">No students found.</div>}
            </div>
        </div>
    );
};

const ExamsManager = ({ exams }: { exams: Exam[] }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [newExam, setNewExam] = useState<Partial<Exam>>({ title: '', durationMinutes: 60, type: 'mcq', questions: [], status: 'draft' });
    const [qDraft, setQDraft] = useState<Partial<Question>>({ options: ['', '', '', ''], answer: '' });

    const handleCreateExam = async () => {
        if (!newExam.title) return alert("Title is required");
        
        const examData: Exam = {
            id: `exam-${Date.now()}`,
            title: newExam.title!,
            durationMinutes: newExam.durationMinutes!,
            type: newExam.type as 'mcq' | 'file',
            questions: newExam.questions || [],
            fileUrl: newExam.fileUrl || '',
            status: 'published', // Publish immediately for MVP
            participants: 0
        };

        await push(ref(db, 'exams'), examData);
        setIsCreating(false);
        setNewExam({ title: '', durationMinutes: 60, type: 'mcq', questions: [], status: 'draft' });
    };

    const addQuestion = () => {
        if (!qDraft.question || !qDraft.answer) return alert("Question and answer required");
        const q: Question = {
            id: `q-${Date.now()}`,
            subject: 'General',
            question: qDraft.question!,
            options: qDraft.options || [],
            answer: qDraft.answer!
        };
        setNewExam({ ...newExam, questions: [...(newExam.questions || []), q] });
        setQDraft({ options: ['', '', '', ''], answer: '', question: '' });
    };

    const deleteExam = (id: string) => {
        if(confirm("Delete this exam permanently?")) remove(ref(db, `exams/${id}`)); 
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-heading font-bold">Exams</h2>
                <Button onClick={() => setIsCreating(true)} variant="primary"><Plus size={18} /> Create Exam</Button>
            </div>

            <div className="grid gap-4">
                {exams.map(e => (
                    <div key={e.id} className="glass-card p-6 rounded-2xl flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-xl">{e.title}</h3>
                            <div className="flex gap-3 text-sm text-gray-400 mt-1">
                                <span className="uppercase">{e.type}</span> • {e.durationMinutes} mins • {e.questions.length} Questions
                            </div>
                        </div>
                        <Badge variant="success">PUBLISHED</Badge>
                    </div>
                ))}
            </div>

            <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Create New Exam">
                <div className="space-y-4">
                    <Input placeholder="Exam Title" value={newExam.title} onChange={e => setNewExam({...newExam, title: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                        <Input type="number" placeholder="Duration (mins)" value={newExam.durationMinutes} onChange={e => setNewExam({...newExam, durationMinutes: parseInt(e.target.value)})} />
                        <Select value={newExam.type} onChange={e => setNewExam({...newExam, type: e.target.value as any})}>
                            <option value="mcq">Multiple Choice</option>
                            <option value="file">File Submission / PDF</option>
                        </Select>
                    </div>

                    {newExam.type === 'mcq' && (
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                            <h4 className="font-bold mb-3 text-sm uppercase text-gray-400">Add Question</h4>
                            <Input placeholder="Question Text" value={qDraft.question || ''} onChange={e => setQDraft({...qDraft, question: e.target.value})} />
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                {qDraft.options?.map((opt, idx) => (
                                    <Input key={idx} placeholder={`Option ${idx+1}`} value={opt} onChange={e => {
                                        const newOpts = [...(qDraft.options || [])];
                                        newOpts[idx] = e.target.value;
                                        setQDraft({...qDraft, options: newOpts});
                                    }} />
                                ))}
                            </div>
                            <Input placeholder="Correct Answer (Match Option Text)" value={qDraft.answer || ''} onChange={e => setQDraft({...qDraft, answer: e.target.value})} />
                            <Button size="sm" onClick={addQuestion} className="w-full mt-2">Add Question</Button>
                        </div>
                    )}

                    {newExam.type === 'file' && (
                        <div className="p-4 border border-dashed border-gray-600 rounded-xl text-center">
                            <p className="text-gray-400 mb-2">Paste PDF/Image URL for the Question Paper</p>
                            <Input placeholder="https://..." value={newExam.fileUrl || ''} onChange={e => setNewExam({...newExam, fileUrl: e.target.value})} />
                            {/* In a real app, integrate uploadToCloudinary here too */}
                        </div>
                    )}

                    <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                        <span className="text-sm text-gray-400">{newExam.questions?.length} Questions Added</span>
                        <Button onClick={handleCreateExam} variant="success">Publish Exam</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

const LibraryManager = ({ library }: { library: LibraryItem[] }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadData, setUploadData] = useState({ title: '', subject: '', file: null as File | null });
    const [loading, setLoading] = useState(false);

    const handleUpload = async () => {
        if (!uploadData.file || !uploadData.title) return alert("Fill all fields");
        setLoading(true);
        try {
            const url = await uploadToCloudinary(uploadData.file);
            const newItem: LibraryItem = {
                id: `lib-${Date.now()}`,
                title: uploadData.title,
                subject: uploadData.subject,
                type: uploadData.file.type.includes('pdf') ? 'pdf' : 'image',
                url: url,
                allowDownload: true,
                addedAt: new Date().toLocaleDateString()
            };
            await push(ref(db, 'library'), newItem);
            setIsUploading(false);
            setUploadData({ title: '', subject: '', file: null });
        } catch (e) {
            alert("Upload failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center">
                <h2 className="text-3xl font-heading font-bold">Library</h2>
                <Button onClick={() => setIsUploading(true)} variant="primary"><Upload size={18} /> Upload Resource</Button>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {library.map(item => (
                    <div key={item.id} className="glass-card p-4 rounded-xl relative group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                {item.type === 'pdf' ? <FileText size={20}/> : <BookOpen size={20}/>}
                            </div>
                            <div className="overflow-hidden">
                                <h4 className="font-bold truncate">{item.title}</h4>
                                <p className="text-xs text-gray-400">{item.subject}</p>
                            </div>
                        </div>
                        <a href={item.url} target="_blank" className="text-xs text-blue-400 hover:underline mt-2 block">View Resource</a>
                    </div>
                ))}
            </div>

            <Modal isOpen={isUploading} onClose={() => setIsUploading(false)} title="Upload Resource">
                <div className="space-y-4">
                    <Input placeholder="Resource Title" value={uploadData.title} onChange={e => setUploadData({...uploadData, title: e.target.value})} />
                    <Input placeholder="Subject (e.g. Mathematics)" value={uploadData.subject} onChange={e => setUploadData({...uploadData, subject: e.target.value})} />
                    <div className="p-8 border-2 border-dashed border-white/10 rounded-xl text-center hover:border-purple-500 transition-colors cursor-pointer relative">
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setUploadData({...uploadData, file: e.target.files?.[0] || null})} />
                        <Upload className="mx-auto mb-2 text-gray-500" />
                        <p className="text-sm text-gray-400">{uploadData.file ? uploadData.file.name : "Click to select PDF or Image"}</p>
                    </div>
                    <Button onClick={handleUpload} className="w-full" isLoading={loading}>Upload & Save</Button>
                </div>
            </Modal>
        </div>
    );
};

const NoticesManager = ({ notices }: { notices: Notice[] }) => {
    const [content, setContent] = useState('');

    const postNotice = async () => {
        if (!content) return;
        const notice: Notice = {
            id: `note-${Date.now()}`,
            content,
            timestamp: new Date().toLocaleString(),
            active: true
        };
        await push(ref(db, 'notices'), notice);
        setContent('');
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <h2 className="text-3xl font-heading font-bold">Announcements</h2>
             <div className="glass-panel p-6 rounded-2xl">
                 <textarea className="glass-input w-full h-24 rounded-xl p-4 resize-none" placeholder="Write a new announcement..." value={content} onChange={e => setContent(e.target.value)} />
                 <div className="flex justify-end mt-2">
                     <Button onClick={postNotice} variant="primary">Post Announcement</Button>
                 </div>
             </div>

             <div className="space-y-3">
                 {notices.slice().reverse().map(n => (
                     <div key={n.id} className="glass-card p-4 rounded-xl flex justify-between items-center">
                         <p className="text-gray-200">{n.content}</p>
                         <span className="text-xs text-gray-500 font-mono">{n.timestamp}</span>
                     </div>
                 ))}
             </div>
        </div>
    );
};

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (e: any) {
            alert("Login failed: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050507]">
            <form onSubmit={handleLogin} className="glass-panel p-10 rounded-3xl w-full max-w-md border border-purple-500/20 shadow-[0_0_50px_rgba(139,92,246,0.1)]">
                <h1 className="text-3xl font-heading font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-amber-400">Admin Portal</h1>
                <Input placeholder="Admin Email" value={email} onChange={e => setEmail(e.target.value)} />
                <Input type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} />
                <Button className="w-full mt-6 bg-purple-600 border-purple-500 hover:bg-purple-500" isLoading={loading}>Secure Login</Button>
            </form>
        </div>
    );
};

// --- Helper Components ---
const SidebarItem = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${active ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}>
        {icon}
        <span className="font-medium tracking-wide">{label}</span>
    </button>
);

const StatCard = ({ icon, label, value, color }: any) => (
    <div className="glass-card p-6 rounded-2xl flex items-center gap-5">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg ${color} bg-opacity-20`}>
            {icon}
        </div>
        <div>
            <h3 className="text-3xl font-heading font-bold">{value}</h3>
            <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">{label}</p>
        </div>
    </div>
);

// We need to render this
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<AdminApp />);

export default AdminApp;