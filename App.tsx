
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
  Briefcase
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
    setLoadingStep('Mapeando columnas...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analiza: ${JSON.stringify(Object.keys(rawData[0]))}. Retorna JSON: {"nombre": "col_nombre", "celular": "col_tel", "ticket": "col_ticket"}.`,
        config: { responseMimeType: "application/json" }
      });
      const mapping = JSON.parse(response.text.replace(/```json|```/g, "").trim());
      const mapped = rawData.map((row, idx) => ({
        id: `p-${Date.now()}-${idx}`,
        nombre: String(row[mapping.nombre] || 'Anónimo'),
        celular: String(row[mapping.celular] || ''),
        ticket: String(row[mapping.ticket] || idx),
        fecha: new Date().toLocaleDateString()
      }));
      setParticipants(prev => [...prev, ...mapped]);
      setStatus(AppStatus.READY);
    } catch (e) {
      alert("Error mapeando. Asegúrate de tener las columnas Nombre, Celular y Ticket.");
    } finally { setIsLoading(false); }
  };

  // Fixed missing handleFileChange function
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'participants' | 'prizes') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (type === 'participants') {
          processParticipantsWithAI(data);
        } else {
          processPrizesExcel(data);
        }
      } catch (err) {
        console.error("Error processing file", err);
        alert("Error al procesar el archivo Excel.");
      }
    };
    reader.readAsBinaryString(file);
    // Reset input value to allow re-uploading the same file
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
        const newW: Winner = { ...winner, wonAt: new Date(), round: currentRound, prize: activePrize.description, sponsor: activePrize.sponsor, sponsorPhone: activePrize.sponsorPhone };
        setCurrentWinner(newW);
        setWinners(prev => [newW, ...prev]);
        setStatus(AppStatus.WINNER_REVEALED);
        saveWinnerToSupabase(newW);
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
      }
    }, 60);
  }, [availableParticipants, currentRound, activePrize]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Zap className="text-indigo-600 fill-current" />
          <h1 className="text-xl font-black">Tribu<span className="text-indigo-600">Sorteos</span></h1>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-2 ${isSupabaseConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {isSupabaseConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />} {isSupabaseConnected ? 'Cloud Activo' : 'Offline'}
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={exportWinners} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-emerald-700 transition-all"><Download className="w-4 h-4" /> EXPORTAR FINAL</button>
          <button onClick={() => { if(confirm("¿Reiniciar?")) { localStorage.clear(); window.location.reload(); } }} className="text-slate-300 hover:text-red-500"><RefreshCcw className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-6 space-y-8">
        
        {/* PANEL SORTEO */}
        <section className="raffle-gradient rounded-[3rem] p-12 text-white border-[8px] border-white shadow-2xl min-h-[55vh] flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="relative z-10 w-full space-y-10">
            {status === AppStatus.SPINNING ? (
              <div className="space-y-6 animate-pulse">
                <div className="text-8xl md:text-[10rem] font-black italic tracking-tighter">{spinName}</div>
                <p className="text-indigo-200 font-bold text-2xl uppercase tracking-widest">Sorteando premio de {activePrize.sponsor}...</p>
              </div>
            ) : status === AppStatus.WINNER_REVEALED && currentWinner ? (
              <div className="space-y-8 animate-in zoom-in-95 duration-500">
                <div className="bg-emerald-500 text-white px-8 py-4 rounded-full font-black text-2xl inline-block border-4 border-white shadow-xl animate-bounce">¡FELICIDADES!</div>
                <h2 className="text-7xl md:text-9xl font-black italic leading-none drop-shadow-2xl">{currentWinner.nombre}</h2>
                <div className="bg-white/10 glass p-8 rounded-[3rem] max-w-2xl mx-auto border border-white/20">
                  <p className="text-indigo-200 text-sm uppercase font-black mb-2 tracking-widest">Ganó el premio de {currentWinner.sponsor}:</p>
                  <p className="text-4xl md:text-6xl font-black text-amber-400 italic leading-tight">"{currentWinner.prize}"</p>
                  <div className="mt-4 flex justify-center gap-4 text-white/60 font-bold">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {currentWinner.celular}</span>
                    <span className="bg-white/10 px-3 py-1 rounded-lg text-xs">{currentWinner.ticket}</span>
                  </div>
                </div>
                <button onClick={() => setStatus(AppStatus.READY)} className="bg-white text-indigo-950 px-16 py-6 rounded-full font-black text-2xl shadow-xl active:translate-y-2 transition-all">SIGUIENTE PREMIO</button>
              </div>
            ) : (
              <div className="space-y-10">
                <div>
                   <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                   <h2 className="text-8xl md:text-[10rem] font-black italic leading-none drop-shadow-2xl opacity-90">TRIBU</h2>
                   <p className="text-indigo-200 text-xl font-bold tracking-[0.5em] mt-4">RONDA #{currentRound}</p>
                </div>
                <div className="bg-amber-400 text-indigo-950 p-12 rounded-[4rem] max-w-3xl mx-auto shadow-2xl relative">
                   <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white px-6 py-2 rounded-full text-[10px] font-black uppercase shadow-md">{activePrize.sponsor} Patrocina:</div>
                   <p className="text-4xl md:text-6xl font-black italic leading-tight">"{activePrize.description}"</p>
                </div>
                <button onClick={startRaffle} disabled={availableParticipants.length === 0} className="bg-white text-indigo-950 px-24 py-10 rounded-full font-black text-5xl shadow-[0_15px_0_0_#cbd5e1] hover:translate-y-1 active:translate-y-4 transition-all disabled:opacity-50">SORTEAR</button>
                <div className="text-indigo-300 font-bold uppercase text-sm tracking-widest">{availableParticipants.length} Participantes en el Bombo</div>
              </div>
            )}
          </div>
        </section>

        {/* CONFIGURACIÓN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="bg-white p-8 rounded-[3rem] shadow-sm border">
            <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-3"><Users className="text-indigo-600" /> Carga de Dueños</h3>
            {participants.length === 0 ? (
              <button onClick={() => participantFileInputRef.current?.click()} className="w-full py-20 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center gap-4 text-slate-400 hover:bg-indigo-50 transition-all">
                <FileSpreadsheet className="w-12 h-12" /> <span className="font-bold">Subir Excel Participantes</span>
              </button>
            ) : (
              <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 flex items-center justify-between">
                <div><p className="text-xs font-black text-emerald-600 uppercase">Participantes Cargados</p><p className="text-3xl font-black text-emerald-900">{participants.length}</p></div>
                <button onClick={() => setParticipants([])} className="p-3 bg-white text-red-500 rounded-2xl shadow-sm"><Trash2 className="w-6 h-6" /></button>
              </div>
            )}
            <input type="file" ref={participantFileInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'participants')} />
          </section>

          <section className="bg-white p-8 rounded-[3rem] shadow-sm border">
            <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-3"><Briefcase className="text-indigo-600" /> Lista de Premios</h3>
            <textarea className="w-full h-32 p-4 bg-slate-50 border-2 border-slate-100 rounded-3xl text-sm font-bold outline-none mb-4" placeholder="Empresa (999000111) : Premio" value={prizesInput} onChange={(e) => setPrizesInput(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={handlePrizeUpdateManual} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Actualizar Lista</button>
              <button onClick={() => prizeFileInputRef.current?.click()} className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Upload className="w-5 h-5" /></button>
            </div>
            <input type="file" ref={prizeFileInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'prizes')} />
          </section>
        </div>

        {/* HISTORIAL DETALLADO */}
        <section className="bg-white rounded-[3rem] shadow-sm border overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-xl font-black uppercase flex items-center gap-4"><Trophy className="text-amber-500" /> Historial de Ganadores Oficiales</h3>
            <div className="bg-indigo-600 text-white px-4 py-1 rounded-full text-xs font-black">{winners.length} Premiados</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-8 py-5">#</th>
                  <th className="px-8 py-5">Ganador (Teléfono)</th>
                  <th className="px-8 py-5">Premio</th>
                  <th className="px-8 py-5">Sponsor (Teléfono)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {winners.map(w => (
                  <tr key={w.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-8 py-6 font-black text-indigo-600 text-lg">#{w.round}</td>
                    <td className="px-8 py-6">
                      <div className="font-black text-slate-900 text-lg leading-tight">{w.nombre}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" /> {w.celular}</span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-black text-slate-500 uppercase">{w.ticket}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-base font-black text-indigo-900 italic leading-tight">"{w.prize}"</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="font-black text-slate-800 uppercase text-xs">{w.sponsor}</div>
                      {w.sponsorPhone && (
                        <div className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-1">
                          <Phone className="w-3 h-3" /> {w.sponsorPhone}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {winners.length === 0 && (
                  <tr><td colSpan={4} className="p-20 text-center opacity-20"><Database className="w-16 h-16 mx-auto mb-4" /><p className="font-black uppercase">Esperando el primer premio...</p></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      <footer className="py-12 text-center opacity-20 font-black uppercase text-[10px] tracking-[0.5em]">Tribu Raffle v7.2 - Supabase Enabled</footer>
    </div>
  );
};

export default App;
