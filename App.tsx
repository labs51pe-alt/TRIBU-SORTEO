
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
  Crown,
  RefreshCcw,
  UserCheck,
  Download,
  Database,
  Wifi,
  WifiOff,
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

  // Process Excel for Prizes
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

  // Process Excel for Participants
  const processParticipantsWithAI = async (rawData: any[]) => {
    if (rawData.length === 0) return;
    setIsLoading(true);
    setLoadingStep('Mapeando columnas con IA...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analiza los encabezados: ${JSON.stringify(Object.keys(rawData[0]))}. Retorna JSON: {"nombre": "col_nombre", "celular": "col_tel", "ticket": "col_ticket"}.`,
        config: { responseMimeType: "application/json" }
      });
      const resText = response.text || "{}";
      const mapping = JSON.parse(resText.replace(/```json|```/g, "").trim());
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
      console.error("Mapping error:", e);
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
        alert("Error al procesar el archivo Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

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

  const startRaffle = useCallback(() => {
    if (availableParticipants.length === 0) return;
    setStatus(AppStatus.SPINNING);
    let counter = 0;
    const maxSpins = 40; 
    spinInterval.current = window.setInterval(() => {
      const idx = Math.floor(Math.random() * availableParticipants.length);
      setSpinName(availableParticipants[idx].nombre);
      if (++counter >= maxSpins) {
        if (spinInterval.current) clearInterval(spinInterval.current);
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
      <header className="bg-white border-b px-5 py-3 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="text-indigo-600 fill-current w-5 h-5" />
          <h1 className="text-lg font-black tracking-tight text-slate-900">Tribu<span className="text-indigo-600">Sorteos</span></h1>
          <div className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 ${isSupabaseConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {isSupabaseConnected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />} {isSupabaseConnected ? 'Cloud Sync' : 'Offline'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportWinners} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[11px] font-black flex items-center gap-2 hover:bg-black transition-all shadow-md active:scale-95">
            <Download className="w-3.5 h-3.5" /> EXPORTAR
          </button>
          <button onClick={() => { if(confirm("¿Deseas reiniciar la sesión?")) { localStorage.clear(); window.location.reload(); } }} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors" title="Reiniciar App">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full p-4 space-y-6">
        
        {/* PANEL SORTEO PRINCIPAL - COMPACTADO */}
        <section className="raffle-gradient rounded-[2.5rem] p-8 md:p-10 text-white border-[6px] border-white shadow-xl min-h-[50vh] flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-500">
          <div className="relative z-10 w-full max-w-4xl space-y-8">
            {status === AppStatus.SPINNING ? (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                <div className="inline-block bg-amber-400 text-indigo-950 px-6 py-1.5 rounded-full font-black text-[10px] uppercase tracking-[0.2em] shadow-lg">GIRANDO...</div>
                <div className="text-6xl md:text-8xl font-black italic tracking-tighter leading-none animate-pulse drop-shadow-lg">
                  {spinName}
                </div>
                <div className="flex flex-col items-center gap-2">
                   <p className="text-indigo-200 font-bold text-base uppercase tracking-widest">Premio de: {activePrize.sponsor}</p>
                   <div className="h-1.5 w-48 bg-white/10 rounded-full overflow-hidden">
                     <div className="h-full bg-amber-400 animate-progress"></div>
                   </div>
                </div>
              </div>
            ) : status === AppStatus.WINNER_REVEALED && currentWinner ? (
              <div className="space-y-6 animate-in zoom-in-90 duration-700">
                <div className="bg-emerald-500 text-white px-8 py-3 rounded-full font-black text-xl inline-block border-2 border-white shadow-xl animate-bounce tracking-widest uppercase">¡Ganador!</div>
                
                <div className="space-y-1">
                  <h2 className="text-6xl md:text-8xl font-black italic leading-none drop-shadow-lg text-white">
                    {currentWinner.nombre}
                  </h2>
                  <div className="flex justify-center gap-4 text-xl font-black text-amber-400">
                     <span className="flex items-center gap-1.5"><Phone className="w-5 h-5" /> {currentWinner.celular}</span>
                     <span className="bg-white/10 px-3 py-0.5 rounded-lg text-white/90 text-xs flex items-center gap-1.5 border border-white/10"><Ticket className="w-3.5 h-3.5" /> {currentWinner.ticket}</span>
                  </div>
                </div>

                <div className="bg-white/10 glass p-6 md:p-8 rounded-[2rem] max-w-2xl mx-auto border border-white/20 shadow-xl backdrop-blur-2xl">
                  <p className="text-indigo-200 text-[10px] uppercase font-black mb-3 tracking-[0.3em]">Premio de {currentWinner.sponsor}:</p>
                  <p className="text-2xl md:text-4xl font-black text-white italic leading-tight mb-4">"{currentWinner.prize}"</p>
                  
                  {currentWinner.sponsorPhone && (
                    <div className="pt-4 border-t border-white/10 flex flex-col items-center gap-1.5">
                       <p className="text-[9px] font-black uppercase text-indigo-300 tracking-widest">Contacto Empresa:</p>
                       <div className="bg-emerald-500/10 px-4 py-1.5 rounded-xl border border-emerald-500/30 text-emerald-400 font-black text-lg flex items-center gap-2">
                         <Phone className="w-4 h-4" /> {currentWinner.sponsorPhone}
                       </div>
                    </div>
                  )}
                </div>

                <button onClick={() => setStatus(AppStatus.READY)} className="group bg-white text-indigo-950 px-12 py-5 rounded-full font-black text-2xl shadow-[0_8px_0_0_#cbd5e1] hover:translate-y-1 active:translate-y-3 transition-all uppercase tracking-widest flex items-center gap-3 mx-auto">
                  SIGUIENTE <Zap className="w-6 h-6 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-2">
                   <Crown className="w-12 h-12 text-amber-400 mx-auto drop-shadow-md" />
                   <h2 className="text-7xl md:text-9xl font-black italic leading-none drop-shadow-lg tracking-tighter uppercase">TRIBU</h2>
                   <div className="inline-block bg-white/10 px-6 py-1.5 rounded-full font-black text-sm tracking-[0.4em] text-indigo-200 backdrop-blur-md">RONDA #{currentRound}</div>
                </div>

                <div className="bg-amber-400 text-indigo-950 p-8 rounded-[3rem] max-w-2xl mx-auto shadow-xl relative group transition-all duration-300">
                   <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white px-5 py-2 rounded-full text-[9px] font-black uppercase shadow-md flex items-center gap-2 border border-amber-400">
                     <Building2 className="w-3.5 h-3.5" /> {activePrize.sponsor} Patrocina:
                   </div>
                   <p className="text-3xl md:text-5xl font-black italic leading-tight tracking-tight">"{activePrize.description}"</p>
                </div>

                <div className="flex flex-col items-center gap-6">
                  <button onClick={startRaffle} disabled={availableParticipants.length === 0} className="group relative bg-white text-indigo-950 px-16 py-8 rounded-full font-black text-3xl md:text-4xl shadow-[0_12px_0_0_#cbd5e1] hover:translate-y-1 active:translate-y-4 transition-all disabled:opacity-50">
                    <span className="flex items-center gap-5"><Play className="w-10 h-10 fill-current group-hover:scale-105 transition-transform" /> SORTEAR</span>
                  </button>
                  <div className="flex items-center gap-3 text-indigo-200 font-black text-[10px] uppercase tracking-[0.3em] opacity-60">
                    <Users className="w-4 h-4" /> {availableParticipants.length} Participantes
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CONTROLES ADMINISTRATIVOS - REDUCIDOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-black uppercase text-slate-800 flex items-center gap-2"><Users className="text-indigo-600 w-5 h-5" /> Participantes</h3>
              {participants.length > 0 && (
                <button onClick={() => setParticipants([])} className="p-2 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {participants.length === 0 ? (
              <button onClick={() => participantFileInputRef.current?.click()} className="w-full py-12 border-2 border-dashed border-slate-100 rounded-[1.5rem] flex flex-col items-center gap-4 text-slate-400 hover:bg-indigo-50/30 transition-all group">
                <FileSpreadsheet className="w-10 h-10 text-slate-200 group-hover:text-indigo-500" />
                <div className="text-center">
                  <span className="font-black text-sm text-slate-900 block">Importar Clientes</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-1 block">Excel (Nombre, Celular, Ticket)</span>
                </div>
              </button>
            ) : (
              <div className="bg-emerald-50/50 p-6 rounded-[1.5rem] border border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-emerald-500 p-4 rounded-2xl text-white shadow-md"><UserCheck className="w-6 h-6" /></div>
                  <div>
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Base Cargada</p>
                    <p className="text-2xl font-black text-emerald-950 tracking-tighter">{participants.length} <span className="text-sm opacity-50">REGISTROS</span></p>
                  </div>
                </div>
                <button onClick={() => setShowFullParticipantList(!showFullParticipantList)} className="px-4 py-2 bg-white text-emerald-600 rounded-xl font-black text-[9px] uppercase shadow-sm border border-emerald-100">
                  {showFullParticipantList ? 'Cerrar' : 'Ver'}
                </button>
              </div>
            )}
            <input type="file" ref={participantFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileChange(e, 'participants')} />
          </section>

          <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <h3 className="text-base font-black uppercase text-slate-800 mb-6 flex items-center gap-2"><Briefcase className="text-indigo-600 w-5 h-5" /> Premios</h3>
            <textarea 
              className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-[1.2rem] text-[13px] font-bold outline-none focus:border-indigo-400 transition-all mb-4 resize-none" 
              placeholder="Empresa (Celular) : Descripción del Premio" 
              value={prizesInput} 
              onChange={(e) => setPrizesInput(e.target.value)} 
            />
            <div className="flex gap-3">
              <button onClick={handlePrizeUpdateManual} className="flex-[2] bg-slate-900 text-white py-3.5 rounded-xl font-black text-[11px] uppercase tracking-[0.1em] shadow-md hover:bg-black active:scale-95 transition-all">GUARDAR LISTA</button>
              <button onClick={() => prizeFileInputRef.current?.click()} className="flex-1 bg-indigo-50 text-indigo-600 py-3.5 rounded-xl font-black text-[11px] uppercase flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" /> EXCEL
              </button>
            </div>
            <input type="file" ref={prizeFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileChange(e, 'prizes')} />
          </section>
        </div>

        {/* TABLA DE GANADORES - MÁS COMPACTA */}
        <section className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 md:p-8 border-b bg-slate-50/30 flex flex-wrap gap-4 justify-between items-center">
            <div className="flex items-center gap-3">
              <Trophy className="text-amber-500 w-6 h-6" />
              <div>
                <h3 className="text-lg font-black uppercase text-slate-900 leading-none">Ganadores Oficiales</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sincronización en tiempo real</p>
              </div>
            </div>
            <div className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-black text-xs shadow-md flex items-center gap-2">
              <Crown className="w-4 h-4" /> {winners.length} PREMIADOS
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-6 py-4">RD</th>
                  <th className="px-6 py-4">Ganador</th>
                  <th className="px-6 py-4">Premio</th>
                  <th className="px-6 py-4">Sponsor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {winners.map(w => (
                  <tr key={w.id} className="hover:bg-indigo-50/20 transition-all">
                    <td className="px-6 py-4">
                       <span className="w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg font-black text-sm border border-indigo-100">#{w.round}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-black text-slate-900 text-base leading-tight">{w.nombre}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">{w.celular} • T-{w.ticket}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-black text-indigo-900 italic leading-tight">"{w.prize}"</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-black text-slate-950 uppercase text-[10px] tracking-wider mb-1">{w.sponsor}</div>
                      {w.sponsorPhone && (
                        <div className="text-[10px] font-black text-emerald-600 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {w.sponsorPhone}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {winners.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-20 text-center opacity-30">
                      <Database className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                      <p className="font-black uppercase text-xs tracking-widest text-slate-400">Sin ganadores registrados</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      <footer className="py-8 text-center mt-auto border-t bg-white">
         <div className="flex flex-col items-center gap-3 opacity-30 text-indigo-600">
           <Zap className="w-4 h-4 fill-current" />
           <span className="font-black text-[9px] uppercase tracking-[0.5em]">Tribu Raffle Engine v7.5 • Compact Edition</span>
         </div>
      </footer>
    </div>
  );
};

export default App;
