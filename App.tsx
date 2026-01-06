
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { 
  Users, 
  Trophy, 
  Upload, 
  Trash2, 
  Play, 
  Search,
  Hash,
  Zap,
  Building2,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  Crown,
  Settings2,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Download,
  Database,
  Wifi,
  WifiOff,
  Info,
  Phone,
  Briefcase,
  Ticket
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import confetti from 'canvas-confetti';
import * as XLSX from 'xlsx';
import { Participant, Winner, AppStatus, Prize } from './types';

const SUPABASE_URL = 'https://lkgdkypahtwtonxkodwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2RreXBhaHR3dG9ueGtvZHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjQ5MjYsImV4cCI6MjA4MzMwMDkyNn0.uLcJ-ZN3cuoniwur_x0QDdec_vLb7aRAKreTXlpq5R8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MAX_ROUNDS = 200; 
const STORAGE_KEY_PARTICIPANTS = 'tribu_v7_participants';
const STORAGE_KEY_PRIZES = 'tribu_v7_prizes';

const App: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>(new Array(MAX_ROUNDS).fill(null).map((_, i) => ({ sponsor: "Tribu", description: `Premio #${i + 1}` })));
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [currentWinner, setCurrentWinner] = useState<Winner | null>(null);
  const [spinName, setSpinName] = useState<string>('');
  const [prizesInput, setPrizesInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullParticipantList, setShowFullParticipantList] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(true);
  
  const participantFileInputRef = useRef<HTMLInputElement>(null);
  const prizeFileInputRef = useRef<HTMLInputElement>(null);
  const spinInterval = useRef<number | null>(null);

  const fetchWinners = async () => {
    try {
      setDbError(null);
      const { data, error } = await supabase
        .from('winners')
        .select('*')
        .order('round', { ascending: false });
      
      if (error) throw error;

      if (data) {
        const formattedWinners: Winner[] = data.map(w => ({
          id: w.id,
          nombre: w.nombre,
          ticket: w.ticket,
          celular: w.celular,
          prize: w.prize,
          sponsor: w.sponsor,
          sponsorPhone: w.sponsor_phone,
          round: w.round,
          fecha: new Date(w.won_at).toLocaleDateString(),
          wonAt: new Date(w.won_at)
        }));
        setWinners(formattedWinners);
        setIsSupabaseConnected(true);
      }
    } catch (err: any) {
      setDbError(err.message || "Error Cloud");
      setIsSupabaseConnected(false);
    }
  };

  useEffect(() => {
    const savedParts = localStorage.getItem(STORAGE_KEY_PARTICIPANTS);
    const savedPrizes = localStorage.getItem(STORAGE_KEY_PRIZES);
    if (savedParts) setParticipants(JSON.parse(savedParts));
    if (savedPrizes) {
      const p = JSON.parse(savedPrizes);
      setPrizes(p);
      const meaningfulPrizes = p.filter((x: Prize) => x.sponsor !== "Tribu");
      if (meaningfulPrizes.length > 0) {
        setPrizesInput(p.map((x: Prize) => `${x.sponsor}${x.sponsorPhone ? ' ('+x.sponsorPhone+')' : ''}: ${x.description}`).join('\n'));
      }
    }
    fetchWinners();
    const channel = supabase.channel('updates').on('postgres_changes', { event: '*', schema: 'public', table: 'winners' }, () => fetchWinners()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(participants));
    localStorage.setItem(STORAGE_KEY_PRIZES, JSON.stringify(prizes));
  }, [participants, prizes]);

  const availableParticipants = useMemo(() => {
    return participants.filter(p => !winners.some(w => w.id === p.id));
  }, [participants, winners]);

  const filteredParticipants = useMemo(() => {
    return participants.filter(p => 
      p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.ticket.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [participants, searchQuery]);

  const currentRound = winners.length + 1;
  const activePrize = useMemo(() => {
    return prizes[winners.length] || { sponsor: "Tribu", description: `Regalo #${currentRound}` };
  }, [prizes, winners.length, currentRound]);

  const saveWinnerToSupabase = async (newWinner: Winner) => {
    try {
      const { error } = await supabase
        .from('winners')
        .insert([{
          id: newWinner.id,
          nombre: newWinner.nombre,
          ticket: newWinner.ticket,
          celular: newWinner.celular,
          prize: newWinner.prize,
          sponsor: newWinner.sponsor,
          sponsor_phone: newWinner.sponsorPhone,
          round: newWinner.round,
          won_at: newWinner.wonAt.toISOString()
        }]);
      if (error) throw error;
    } catch (err: any) {
      setDbError(err.message);
    }
  };

  const handlePrizeUpdateManual = () => {
    const lines = prizesInput.split('\n').filter(l => l.trim() !== "");
    const updatedPrizes: Prize[] = new Array(MAX_ROUNDS).fill(null).map((_, i) => ({ sponsor: "Tribu", description: `Premio #${i + 1}` }));
    lines.forEach((l, i) => { 
      if(i < MAX_ROUNDS) {
        if (l.includes(':')) {
          const [spPart, descPart] = l.split(':');
          let sp = spPart.trim();
          let ph = "";
          if (sp.includes('(') && sp.includes(')')) {
            const match = sp.match(/\(([^)]+)\)/);
            if (match) { ph = match[1]; sp = sp.replace(/\([^)]+\)/, "").trim(); }
          }
          updatedPrizes[i] = { sponsor: sp, description: descPart.trim(), sponsorPhone: ph };
        } else {
          updatedPrizes[i] = { sponsor: "Tribu", description: l.trim() };
        }
      }
    });
    setPrizes([...updatedPrizes]);
  };

  const exportWinners = () => {
    if (winners.length === 0) return alert("No hay ganadores.");
    const dataToExport = winners.map(w => ({
      Ronda: w.round,
      Ganador: w.nombre,
      Tel_Ganador: w.celular,
      Ticket: w.ticket,
      Premio: w.prize,
      Empresa: w.sponsor,
      Tel_Empresa: w.sponsorPhone || 'N/A'
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ganadores");
    XLSX.writeFile(wb, `Tribu_Final_${new Date().toLocaleDateString()}.xlsx`);
  };

  const processPrizesExcel = (jsonData: any[]) => {
    let prizeList: Prize[] = [];
    if (jsonData.length > 0) {
      const keys = Object.keys(jsonData[0]);
      const sponsorKey = keys.find(k => k.toLowerCase().match(/negocio|empresa|sponsor|marca/));
      const descriptionKey = keys.find(k => k.toLowerCase().match(/premio|regalo|descripcion/));
      const phoneKey = keys.find(k => k.toLowerCase().match(/celular|tel|fono|whatsapp/));
      
      prizeList = jsonData.map(row => ({
        sponsor: String(row[sponsorKey || keys[0]] || "Tribu").trim(),
        description: String(row[descriptionKey || keys[keys.length - 1]] || "Sin descripción").trim(),
        sponsorPhone: row[phoneKey] ? String(row[phoneKey]).trim() : ""
      })).filter(p => p.description && p.description !== "undefined");
    }
    if (prizeList.length > 0) {
      const newPrizes = [...prizes];
      prizeList.forEach((p, i) => { if(i < MAX_ROUNDS) newPrizes[i] = p; });
      setPrizes(newPrizes);
      setPrizesInput(prizeList.map(p => `${p.sponsor}${p.sponsorPhone ? ' ('+p.sponsorPhone+')' : ''}: ${p.description}`).join('\n'));
    }
  };

  const processParticipantsWithAI = async (rawData: any[]) => {
    if (rawData.length === 0) return;
    setIsLoading(true);
    setLoadingStep('Mapeando columnas con IA...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analiza los encabezados de este Excel: ${JSON.stringify(Object.keys(rawData[0]))}. Basado en la imagen de referencia (name, phone, ticket_code), retorna un JSON estricto: {"nombre": "col_nombre", "celular": "col_tel", "ticket": "col_ticket"}.`,
        config: { responseMimeType: "application/json" }
      });
      const mapping = JSON.parse(response.text.replace(/```json|```/g, "").trim());
      const mapped = rawData.map((row, idx) => ({
        id: `p-${Date.now()}-${idx}`,
        nombre: String(row[mapping.nombre] || row['name'] || row['Dueño'] || 'Anónimo'),
        celular: String(row[mapping.celular] || row['phone'] || row['Celular'] || ''),
        ticket: String(row[mapping.ticket] || row['ticket_code'] || row['Negocio'] || idx),
        fecha: new Date().toLocaleDateString()
      }));
      setParticipants(prev => [...prev, ...mapped]);
      setStatus(AppStatus.READY);
    } catch (e) {
      alert("Error mapeando. Usando fallback automático.");
      const mapped = rawData.map((row, idx) => ({
        id: `p-${Date.now()}-${idx}`,
        nombre: String(row['name'] || row['Nombre'] || 'Anónimo'),
        celular: String(row['phone'] || row['Celular'] || ''),
        ticket: String(row['ticket_code'] || row['Ticket'] || idx),
        fecha: new Date().toLocaleDateString()
      }));
      setParticipants(prev => [...prev, ...mapped]);
    } finally { setIsLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'participants' | 'prizes') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws);

        if (type === 'participants') {
          processParticipantsWithAI(jsonData);
        } else {
          processPrizesExcel(jsonData);
        }
      } catch (err) {
        console.error("Error processing file", err);
        alert("Error al procesar el archivo Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const startRaffle = useCallback(() => {
    if (availableParticipants.length === 0) return;
    setStatus(AppStatus.SPINNING);
    let counter = 0;
    const maxSpins = 40; 
    spinInterval.current = window.setInterval(() => {
      setSpinName(availableParticipants[Math.floor(Math.random() * availableParticipants.length)].nombre);
      if (++counter >= maxSpins) {
        clearInterval(spinInterval.current!);
        const winner = availableParticipants[Math.floor(Math.random() * availableParticipants.length)];
        const newW: Winner = { 
          ...winner, 
          wonAt: new Date(), 
          round: currentRound, 
          prize: activePrize.description, 
          sponsor: activePrize.sponsor, 
          sponsorPhone: activePrize.sponsorPhone 
        };
        setCurrentWinner(newW);
        setWinners(prev => [newW, ...prev]);
        setStatus(AppStatus.WINNER_REVEALED);
        saveWinnerToSupabase(newW);
        confetti({ 
          particleCount: 300, 
          spread: 120, 
          origin: { y: 0.5 },
          colors: ['#4f46e5', '#fbbf24', '#10b981', '#f43f5e']
        });
      }
    }, 65);
  }, [availableParticipants, currentRound, activePrize]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Zap className="text-indigo-600 fill-current" />
          <h1 className="text-xl font-black tracking-tight text-slate-900">Tribu<span className="text-indigo-600">Sorteos</span></h1>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-2 ${isSupabaseConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {isSupabaseConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />} {isSupabaseConnected ? 'Cloud Sync' : 'Offline'}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={exportWinners} className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 hover:bg-black transition-all shadow-lg active:scale-95">
            <Download className="w-4 h-4" /> EXPORTAR RESULTADOS
          </button>
          <button onClick={() => { if(confirm("¿Deseas reiniciar la sesión?")) { localStorage.clear(); window.location.reload(); } }} className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Reiniciar App">
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-6 space-y-8">
        
        {/* PANEL SORTEO PRINCIPAL */}
        <section className="raffle-gradient rounded-[4rem] p-12 text-white border-[10px] border-white shadow-2xl min-h-[60vh] flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-500">
          <div className="relative z-10 w-full max-w-5xl space-y-12">
            {status === AppStatus.SPINNING ? (
              <div className="space-y-8 animate-in zoom-in-95 duration-300">
                <div className="inline-block bg-amber-400 text-indigo-950 px-8 py-2 rounded-full font-black text-xs uppercase tracking-[0.3em] shadow-xl">GIRANDO TÓMBOLA...</div>
                <div className="text-8xl md:text-[11rem] font-black italic tracking-tighter leading-none animate-pulse drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">
                  {spinName}
                </div>
                <div className="flex flex-col items-center gap-3">
                   <p className="text-indigo-200 font-bold text-xl uppercase tracking-widest">Premio de: {activePrize.sponsor}</p>
                   <div className="h-2 w-64 bg-white/10 rounded-full overflow-hidden">
                     <div className="h-full bg-amber-400 animate-progress"></div>
                   </div>
                </div>
              </div>
            ) : status === AppStatus.WINNER_REVEALED && currentWinner ? (
              <div className="space-y-8 animate-in zoom-in-90 duration-700">
                <div className="bg-emerald-500 text-white px-10 py-5 rounded-full font-black text-3xl inline-block border-4 border-white shadow-2xl animate-bounce tracking-widest">¡GANADOR OFICIAL!</div>
                
                <div className="space-y-2">
                  <h2 className="text-7xl md:text-[10rem] font-black italic leading-none drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)] text-white">
                    {currentWinner.nombre}
                  </h2>
                  <div className="flex justify-center gap-6 text-2xl font-black text-amber-400">
                     <span className="flex items-center gap-2"><Phone className="w-6 h-6" /> {currentWinner.celular}</span>
                     <span className="bg-white/10 px-4 py-1 rounded-xl text-white/90 text-sm flex items-center gap-2 border border-white/10"><Ticket className="w-4 h-4" /> {currentWinner.ticket}</span>
                  </div>
                </div>

                <div className="bg-white/10 glass p-10 rounded-[4rem] max-w-3xl mx-auto border border-white/20 shadow-2xl backdrop-blur-3xl transform hover:scale-105 transition-transform">
                  <p className="text-indigo-200 text-sm uppercase font-black mb-4 tracking-[0.4em]">Se ha llevado el premio de {currentWinner.sponsor}:</p>
                  <p className="text-4xl md:text-6xl font-black text-white italic leading-tight mb-6">"{currentWinner.prize}"</p>
                  
                  {currentWinner.sponsorPhone && (
                    <div className="pt-6 border-t border-white/10 flex flex-col items-center gap-2">
                       <p className="text-[10px] font-black uppercase text-indigo-300 tracking-widest">Contacto de la Empresa:</p>
                       <div className="bg-emerald-500/20 px-6 py-2 rounded-2xl border border-emerald-500/40 text-emerald-400 font-black text-xl flex items-center gap-3">
                         <Phone className="w-5 h-5" /> {currentWinner.sponsorPhone}
                       </div>
                    </div>
                  )}
                </div>

                <button onClick={() => setStatus(AppStatus.READY)} className="group bg-white text-indigo-950 px-20 py-8 rounded-full font-black text-4xl shadow-[0_15px_0_0_#cbd5e1] hover:translate-y-2 active:translate-y-5 transition-all uppercase tracking-widest flex items-center gap-4 mx-auto">
                  CONTINUAR <Zap className="w-8 h-8 group-hover:scale-125 transition-transform" />
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="space-y-4">
                   <Crown className="w-20 h-20 text-amber-400 mx-auto drop-shadow-lg" />
                   <h2 className="text-9xl md:text-[13rem] font-black italic leading-none drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)] tracking-tighter">TRIBU</h2>
                   <div className="inline-block bg-white/10 px-8 py-2 rounded-full font-black text-2xl tracking-[0.5em] text-indigo-200 backdrop-blur-md">RONDA #{currentRound}</div>
                </div>

                <div className="bg-amber-400 text-indigo-950 p-12 rounded-[5rem] max-w-4xl mx-auto shadow-[0_25px_50px_-12px_rgba(251,191,36,0.3)] relative group transform transition-all duration-300 hover:-rotate-1">
                   <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-8 py-3 rounded-full text-xs font-black uppercase shadow-xl flex items-center gap-3 border-2 border-amber-400">
                     <Building2 className="w-4 h-4" /> {activePrize.sponsor} Patrocina:
                   </div>
                   <p className="text-5xl md:text-7xl font-black italic leading-tight tracking-tight">"{activePrize.description}"</p>
                   {activePrize.sponsorPhone && (
                     <div className="mt-6 flex justify-center items-center gap-2 font-black opacity-50 text-sm">
                       <Phone className="w-4 h-4" /> {activePrize.sponsorPhone}
                     </div>
                   )}
                </div>

                <div className="flex flex-col items-center gap-10">
                  <button onClick={startRaffle} disabled={availableParticipants.length === 0} className="group relative bg-white text-indigo-950 px-28 py-12 rounded-full font-black text-6xl shadow-[0_20px_0_0_#cbd5e1] hover:translate-y-2 active:translate-y-6 transition-all disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none">
                    <span className="flex items-center gap-8"><Play className="w-16 h-16 fill-current group-hover:scale-110 transition-transform" /> SORTEAR</span>
                  </button>
                  <div className="flex items-center gap-4 text-indigo-200 font-black text-sm uppercase tracking-[0.4em] opacity-60">
                    <Users className="w-5 h-5" /> {availableParticipants.length} Participantes Restantes
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CONTROLES ADMINISTRATIVOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="bg-white p-8 rounded-[3.5rem] shadow-sm border border-slate-100 transition-all hover:shadow-md">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black uppercase text-slate-800 flex items-center gap-3"><Users className="text-indigo-600 w-6 h-6" /> Carga de participantes</h3>
              {participants.length > 0 && (
                <button onClick={() => setParticipants([])} className="p-3 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all" title="Vaciar Lista">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {participants.length === 0 ? (
              <button onClick={() => participantFileInputRef.current?.click()} className="w-full py-24 border-2 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center gap-6 text-slate-400 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all group">
                <div className="bg-slate-50 p-6 rounded-3xl group-hover:bg-white transition-all shadow-sm">
                   <FileSpreadsheet className="w-12 h-12 text-slate-300 group-hover:text-indigo-600" />
                </div>
                <div className="text-center">
                  <span className="font-black text-lg text-slate-900 block">Subir Excel de Clientes</span>
                  <span className="text-xs font-bold uppercase tracking-widest opacity-60 mt-2 block">Nombre, Teléfono, Ticket</span>
                </div>
              </button>
            ) : (
              <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-6">
                  <div className="bg-emerald-500 p-5 rounded-[2rem] text-white shadow-lg"><UserCheck className="w-8 h-8" /></div>
                  <div>
                    <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">Base de Datos Lista</p>
                    <p className="text-4xl font-black text-emerald-950 tracking-tighter">{participants.length} <span className="text-lg opacity-60">CLIENTES</span></p>
                  </div>
                </div>
                <button onClick={() => setShowFullParticipantList(!showFullParticipantList)} className="px-6 py-3 bg-white/80 hover:bg-white text-emerald-600 rounded-2xl font-black text-[10px] uppercase shadow-sm transition-all">
                  {showFullParticipantList ? 'Ocultar' : 'Ver Todos'}
                </button>
              </div>
            )}
            <input type="file" ref={participantFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileChange(e, 'participants')} />
          </section>

          <section className="bg-white p-8 rounded-[3.5rem] shadow-sm border border-slate-100 transition-all hover:shadow-md">
            <h3 className="text-xl font-black uppercase text-slate-800 mb-8 flex items-center gap-3"><Briefcase className="text-indigo-600 w-6 h-6" /> Lista de Premios</h3>
            <textarea 
              className="w-full h-40 p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-sm font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all mb-4 resize-none" 
              placeholder="Ejemplo: Empresa (999000111) : Premio Increíble" 
              value={prizesInput} 
              onChange={(e) => setPrizesInput(e.target.value)} 
            />
            <div className="flex gap-4">
              <button onClick={handlePrizeUpdateManual} className="flex-[2] bg-slate-900 text-white py-5 rounded-[1.8rem] font-black text-xs uppercase tracking-[0.2em] shadow-lg hover:bg-black active:scale-95 transition-all">ACTUALIZAR PREMIOS</button>
              <button onClick={() => prizeFileInputRef.current?.click()} className="flex-1 bg-indigo-50 text-indigo-600 py-5 rounded-[1.8rem] font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all">
                <Upload className="w-5 h-5" /> EXCEL
              </button>
            </div>
            <input type="file" ref={prizeFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileChange(e, 'prizes')} />
          </section>
        </div>

        {/* TABLA DE GANADORES FINAL */}
        <section className="bg-white rounded-[4rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-10 border-b bg-slate-50/50 flex flex-wrap gap-6 justify-between items-center">
            <div className="space-y-1">
              <h3 className="text-2xl font-black uppercase text-slate-900 flex items-center gap-4"><Trophy className="text-amber-500 w-8 h-8" /> Historial de Ganadores Oficiales</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-12">Registro en tiempo real sincronizado con Cloud</p>
            </div>
            <div className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl flex items-center gap-3">
              <Crown className="w-5 h-5" /> {winners.length} PREMIADOS HOY
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b">
                <tr>
                  <th className="px-10 py-6">Ronda</th>
                  <th className="px-10 py-6">Ganador (Información)</th>
                  <th className="px-10 py-6">Premio Obtenido</th>
                  <th className="px-10 py-6">Empresa & Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {winners.map(w => (
                  <tr key={w.id} className="hover:bg-indigo-50/40 transition-all duration-300">
                    <td className="px-10 py-8">
                       <span className="w-12 h-12 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xl border border-indigo-100">#{w.round}</span>
                    </td>
                    <td className="px-10 py-8">
                      <div className="font-black text-slate-900 text-xl leading-tight mb-1">{w.nombre}</div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-bold text-slate-500 flex items-center gap-1.5"><Phone className="w-4 h-4 text-emerald-500" /> {w.celular}</span>
                        <span className="bg-slate-100 px-3 py-1 rounded-lg text-[10px] font-black text-slate-500 uppercase flex items-center gap-1.5 border border-slate-200"><Ticket className="w-3.5 h-3.5" /> {w.ticket}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="text-lg font-black text-indigo-900 italic leading-tight group-hover:translate-x-1 transition-transform">"{w.prize}"</div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="font-black text-slate-950 uppercase text-xs tracking-wider flex items-center gap-2 mb-2"><Building2 className="w-3.5 h-3.5 text-indigo-400" /> {w.sponsor}</div>
                      {w.sponsorPhone ? (
                        <div className="text-sm font-black text-emerald-600 flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 w-fit">
                          <Phone className="w-4 h-4" /> {w.sponsorPhone}
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 italic">Sin teléfono registrado</span>
                      )}
                    </td>
                  </tr>
                ))}
                {winners.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-32 text-center opacity-25">
                      <Database className="w-24 h-24 mx-auto mb-6 text-slate-300" />
                      <p className="font-black uppercase text-lg tracking-[0.5em] text-slate-400">Esperando el primer ganador...</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      <footer className="py-16 text-center mt-auto border-t bg-white">
         <div className="flex flex-col items-center gap-4 opacity-30 text-indigo-600">
           <Zap className="w-6 h-6 fill-current" />
           <span className="font-black text-[11px] uppercase tracking-[0.8em]">Tribu Raffle Engine v7.3 • Cloud & AI Optimized</span>
         </div>
      </footer>
    </div>
  );
};

export default App;
