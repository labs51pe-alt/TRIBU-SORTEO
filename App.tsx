
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { 
  Users, 
  Trophy, 
  Upload, 
  Trash2, 
  Play, 
  Zap,
  Building2,
  FileSpreadsheet,
  Crown,
  RefreshCcw,
  Download,
  Wifi,
  WifiOff,
  Phone,
  Sparkles
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
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(true);
  
  const participantFileInputRef = useRef<HTMLInputElement>(null);
  const prizeFileInputRef = useRef<HTMLInputElement>(null);
  const spinInterval = useRef<number | null>(null);

  const handlePrizeUpdateManual = () => {
    const lines = prizesInput.split('\n').filter(l => l.trim());
    const newPrizes: Prize[] = new Array(MAX_ROUNDS).fill(null).map((_, i) => ({ sponsor: "Tribu", description: `Premio #${i + 1}` }));
    lines.forEach((line, i) => {
      if (i < MAX_ROUNDS) {
        const parts = line.split(':');
        const sponsorPart = parts[0]?.trim() || "Tribu";
        const descPart = parts.slice(1).join(':').trim() || `Premio #${i + 1}`;
        newPrizes[i] = { sponsor: sponsorPart, description: descPart };
      }
    });
    setPrizes(newPrizes);
    alert("Lista de negocios actualizada.");
  };

  const clearPrizes = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if(confirm("¿Estás seguro de que deseas borrar TODA la lista de negocios y premios?")) {
      const resetPrizes = new Array(MAX_ROUNDS).fill(null).map((_, i) => ({ sponsor: "Tribu", description: `Premio #${i + 1}` }));
      setPrizes(resetPrizes);
      setPrizesInput('');
      localStorage.setItem(STORAGE_KEY_PRIZES, JSON.stringify(resetPrizes));
    }
  };

  const exportWinners = () => {
    if (winners.length === 0) return;
    const dataToExport = winners.map(w => ({
      Ronda: w.round,
      Participante_Ganador: w.nombre,
      Celular_Ganador: w.celular,
      Premio: w.prize,
      Empresa_Sponsor: w.sponsor,
      Ticket: w.ticket,
      Fecha: w.wonAt.toLocaleString()
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ganadores");
    XLSX.writeFile(wb, `Ganadores_Tribu_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const processPrizesExcel = (jsonData: any[]) => {
    if (jsonData.length === 0) return;
    const keys = Object.keys(jsonData[0]);
    const colNegocio = keys.find(k => k.toLowerCase() === 'negocio') || keys[0];
    const colPremio = keys.find(k => k.toLowerCase() === 'premio') || keys[keys.length - 1];
    const colCelular = keys.find(k => k.toLowerCase() === 'celular');

    const prizeList: Prize[] = jsonData.map(row => ({
      sponsor: String(row[colNegocio] || "Tribu").trim(),
      description: String(row[colPremio] || "Sin descripción").trim(),
      sponsorPhone: colCelular ? String(row[colCelular]).trim() : undefined
    })).filter(p => p.description && p.description !== "undefined");

    if (prizeList.length > 0) {
      const newPrizes = [...prizes];
      prizeList.forEach((p, i) => { if(i < MAX_ROUNDS) newPrizes[i] = p; });
      setPrizes(newPrizes);
      setPrizesInput(prizeList.map(p => `${p.sponsor}: ${p.description}`).join('\n'));
      alert(`${prizeList.length} Negocios y Premios cargados correctamente.`);
    }
  };

  const processParticipantsWithAI = async (rawData: any[]) => {
    if (rawData.length === 0) return;
    setIsLoading(true);
    try {
      const allKeys = Object.keys(rawData[0]);
      const colNombre = allKeys.find(k => ['name', 'dueño', 'nombre'].includes(k.toLowerCase())) || allKeys[2];
      const colCelular = allKeys.find(k => ['phone', 'celular', 'tel'].includes(k.toLowerCase())) || allKeys[3];
      const colTicket = allKeys.find(k => ['ticket_code', 'negocio', 'ticket'].includes(k.toLowerCase())) || allKeys[4];
      const colPremio = allKeys.find(k => ['premio', 'premio_asignado'].includes(k.toLowerCase()));

      const mapped = rawData.map((row, idx) => ({
        id: `p-${Date.now()}-${idx}`,
        nombre: String(row[colNombre] || 'Anónimo').trim(),
        celular: String(row[colCelular] || '').trim(),
        ticket: String(row[colTicket] || idx).trim(),
        premio_asignado: colPremio ? String(row[colPremio]).trim() : undefined,
        negocio_nombre: String(row[colTicket] || 'Tribu').trim(),
        fecha: new Date().toLocaleDateString()
      }));
      
      setParticipants(prev => [...prev, ...mapped]);
      setStatus(AppStatus.READY);
    } catch (e) {
      console.error(e);
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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        if (type === 'participants') processParticipantsWithAI(jsonData);
        else processPrizesExcel(jsonData);
      } catch (err) {
        alert("Error al procesar el archivo Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const fetchWinners = async () => {
    try {
      const { data, error } = await supabase.from('winners').select('*').order('round', { ascending: false });
      if (error) throw error;
      if (data) {
        setWinners(data.map(w => ({
          id: w.id, nombre: w.nombre, ticket: w.ticket, celular: w.celular, prize: w.prize,
          sponsor: w.sponsor, round: w.round, wonAt: new Date(w.won_at), fecha: new Date(w.won_at).toLocaleDateString()
        })));
        setIsSupabaseConnected(true);
      }
    } catch (err) { 
      console.error(err);
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
      const manualLines = p.filter((x: Prize) => x.sponsor !== "Tribu").map((x: Prize) => `${x.sponsor}: ${x.description}`).join('\n');
      setPrizesInput(manualLines);
    }
    fetchWinners();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(participants));
    localStorage.setItem(STORAGE_KEY_PRIZES, JSON.stringify(prizes));
  }, [participants, prizes]);

  const availableParticipants = useMemo(() => {
    return participants.filter(p => !winners.some(w => w.id === p.id));
  }, [participants, winners]);

  const currentRound = winners.length + 1;
  const activePrize = useMemo(() => prizes[winners.length] || { sponsor: "Tribu", description: `Premio #${currentRound}` }, [prizes, winners.length, currentRound]);

  const startRaffle = useCallback(() => {
    if (availableParticipants.length === 0) return;
    setStatus(AppStatus.SPINNING);
    let counter = 0;
    const maxIterations = 80; 
    spinInterval.current = window.setInterval(() => {
      const idx = Math.floor(Math.random() * availableParticipants.length);
      setSpinName(availableParticipants[idx].nombre);
      if (++counter >= maxIterations) {
        if (spinInterval.current) clearInterval(spinInterval.current);
        const winner = availableParticipants[Math.floor(Math.random() * availableParticipants.length)];
        const finalPrize = winner.premio_asignado || activePrize.description;
        const finalSponsor = activePrize.sponsor || 'Tribu';

        const newW: Winner = { 
          ...winner, wonAt: new Date(), round: currentRound, 
          prize: finalPrize, sponsor: finalSponsor
        };
        
        setCurrentWinner(newW);
        setWinners(prev => [newW, ...prev]);
        setStatus(AppStatus.WINNER_REVEALED);
        
        supabase.from('winners').insert([{
          id: newW.id, nombre: newW.nombre, ticket: newW.ticket, celular: newW.celular,
          prize: newW.prize, sponsor: newW.sponsor,
          round: newW.round, won_at: newW.wonAt.toISOString()
        }]).then();
        
        confetti({ particleCount: 600, spread: 180, origin: { y: 0.6 } });
      }
    }, 70);
  }, [availableParticipants, currentRound, activePrize]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-sm h-16">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-100">
            <Zap className="text-white fill-current w-4 h-4" />
          </div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">Tribu<span className="text-indigo-600">Sorteos</span></h1>
          <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase flex items-center gap-2 border ${isSupabaseConnected ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'} ml-2`}>
            {isSupabaseConnected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />} {isSupabaseConnected ? 'CLOUD SYNC' : 'OFFLINE'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportWinners} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95">
            <Download className="w-3.5 h-3.5" /> Exportar Resultados
          </button>
          <button onClick={() => { if(confirm("¿Deseas reiniciar toda la aplicación? Esto borrará TODO.")) { localStorage.clear(); window.location.reload(); } }} className="p-2 text-slate-300 hover:text-red-500 transition-colors bg-slate-50 rounded-lg" title="Reiniciar App">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 md:p-6 space-y-8">
        
        {/* PANTALLA DE SORTEO COMPACTA */}
        <section className="raffle-gradient rounded-[2.5rem] p-6 md:p-10 text-white border-[8px] border-white shadow-2xl min-h-[500px] md:min-h-[550px] flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <div className="grid grid-cols-10 gap-8 transform rotate-12 scale-150">
               {Array.from({length: 40}).map((_, i) => <Building2 key={i} className="w-16 h-16" />)}
            </div>
          </div>

          <div className="relative z-10 w-full max-w-4xl space-y-8">
            {status === AppStatus.SPINNING ? (
              <div className="space-y-6 animate-in zoom-in-95">
                <div className="inline-flex items-center gap-2 bg-amber-400 text-indigo-950 px-8 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.5em] shadow-xl">
                   <RefreshCcw className="w-4 h-4 animate-spin" /> Girando...
                </div>
                <div className="text-6xl md:text-8xl font-black italic tracking-tighter animate-pulse leading-none drop-shadow-2xl">{spinName}</div>
                <div className="h-2 w-64 bg-white/10 rounded-full mx-auto overflow-hidden border border-white/10 shadow-inner">
                   <div className="h-full bg-amber-400 animate-progress"></div>
                </div>
                <p className="text-indigo-200 font-black uppercase tracking-[0.3em] text-[10px] italic">Buscando ganador para {activePrize.sponsor}...</p>
              </div>
            ) : status === AppStatus.WINNER_REVEALED && currentWinner ? (
              <div className="space-y-6 animate-in zoom-in-90 duration-500">
                <div className="bg-emerald-500 text-white px-8 py-3 rounded-full font-black text-xl inline-flex items-center gap-3 border-4 border-white shadow-2xl animate-bounce tracking-widest uppercase">
                  <Trophy className="w-7 h-7" /> ¡GANADOR!
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-6xl md:text-8xl font-black italic leading-none drop-shadow-2xl text-white tracking-tighter">{currentWinner.nombre}</h2>
                </div>

                <div className="bg-white/10 glass p-8 md:p-10 rounded-[3rem] max-w-4xl mx-auto border border-white/20 shadow-xl backdrop-blur-xl">
                  <div className="flex flex-col items-center gap-6">
                    <div className="flex flex-col items-center gap-2">
                       <span className="flex items-center gap-2 text-amber-400 font-black uppercase text-[10px] tracking-[0.5em] mb-1"><Sparkles className="w-4 h-4" /> Patrocinador</span>
                       <h3 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none flex items-center gap-4 italic">
                         <Building2 className="w-10 h-10 text-indigo-400" /> {currentWinner.sponsor}
                       </h3>
                    </div>
                    
                    <div className="w-full h-px bg-white/10" />

                    <div className="space-y-2">
                       <p className="text-[10px] font-black uppercase text-indigo-300 tracking-[0.5em]">Premio:</p>
                       <p className="text-4xl md:text-6xl font-black text-amber-400 italic leading-tight drop-shadow-lg">"{currentWinner.prize}"</p>
                    </div>

                    <div className="bg-emerald-500 text-white px-10 py-4 rounded-[2rem] font-black text-2xl md:text-4xl flex items-center gap-4 shadow-xl border-2 border-white/20">
                       <p className="tracking-[0.1em] flex items-center gap-3"><Phone className="w-8 h-8" /> {currentWinner.celular}</p>
                    </div>
                  </div>
                </div>

                <button onClick={() => setStatus(AppStatus.READY)} className="bg-white text-indigo-950 px-16 py-6 rounded-full font-black text-3xl shadow-[0_12px_0_0_#cbd5e1] hover:translate-y-2 active:translate-y-6 transition-all uppercase tracking-widest flex items-center gap-6 mx-auto mt-10 border-4 border-indigo-100">
                  CONTINUAR <Play className="w-10 h-10 fill-current" />
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-3">
                  <Crown className="w-12 h-12 text-amber-400 mx-auto drop-shadow-xl mb-2" />
                  <h2 className="text-8xl md:text-[11rem] font-black italic tracking-tighter uppercase leading-none drop-shadow-2xl text-white">TRIBU</h2>
                  <div className="bg-white/10 px-6 py-1.5 rounded-full inline-block backdrop-blur-md">
                    <p className="text-white font-black uppercase text-xs tracking-[0.6em] opacity-90">RONDA #{currentRound}</p>
                  </div>
                </div>
                
                <div className="bg-amber-400 text-indigo-950 p-8 md:p-10 rounded-[2.5rem] max-w-2xl mx-auto shadow-xl border-4 border-white transform hover:scale-[1.02] transition-transform relative">
                   <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white text-indigo-900 px-6 py-1 rounded-full font-black text-[9px] uppercase border-2 border-amber-400 shadow-sm flex items-center gap-2">
                     <Building2 className="w-3 h-3" /> {activePrize.sponsor} PATROCINA:
                   </div>
                   <p className="text-4xl md:text-5xl font-black italic leading-tight tracking-tight">"{activePrize.description}"</p>
                </div>
                
                <button onClick={startRaffle} disabled={availableParticipants.length === 0} className="group bg-white text-indigo-950 px-20 py-8 rounded-full font-black text-5xl shadow-[0_15px_0_0_#cbd5e1] hover:translate-y-2 active:translate-y-8 transition-all animate-glow-pulse uppercase flex items-center gap-8 border-[6px] border-indigo-100 mt-4">
                  <Play className="w-14 h-14 fill-current group-hover:scale-110 transition-transform" /> SORTEAR
                </button>
                
                <div className="flex justify-center gap-4">
                   <div className="bg-white/5 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 shadow-lg">
                      <p className="text-[9px] font-black uppercase text-indigo-300 tracking-widest mb-0.5">Participantes</p>
                      <p className="text-2xl font-black text-white">{availableParticipants.length}</p>
                   </div>
                   <div className="bg-white/5 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 shadow-lg">
                      <p className="text-[9px] font-black uppercase text-indigo-300 tracking-widest mb-0.5">Ganadores</p>
                      <p className="text-2xl font-black text-amber-400">{winners.length}</p>
                   </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CONFIGURACIÓN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-3"><Users className="text-indigo-600 w-6 h-6" /> Participantes</h3>
                {participants.length > 0 && <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[9px] font-black border border-emerald-100 uppercase">Cargados</span>}
              </div>
              
              {participants.length === 0 ? (
                <button type="button" onClick={() => participantFileInputRef.current?.click()} className="w-full py-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center gap-4 text-slate-400 hover:bg-indigo-50/50 hover:border-indigo-100 transition-all group/btn">
                  <FileSpreadsheet className="w-10 h-10 text-slate-200 group-hover/btn:text-indigo-400 transition-colors" />
                  <div className="text-center">
                    <span className="font-black text-sm text-slate-900 block mb-1">Subir Excel Participantes</span>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Format: name, phone, ticket_code</p>
                  </div>
                </button>
              ) : (
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-inner">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Registros</p>
                    <p className="text-3xl font-black text-slate-900">{participants.length} <span className="text-xs text-slate-400 font-bold">Participantes</span></p>
                  </div>
                  <button type="button" onClick={() => setParticipants([])} className="p-4 bg-white text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-50" title="Borrar participantes"><Trash2 className="w-6 h-6" /></button>
                </div>
              )}
            </div>
            <input type="file" ref={participantFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileChange(e, 'participants')} />
          </section>

          <section className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-3"><Building2 className="text-indigo-600 w-6 h-6" /> Negocios y Premios</h3>
                {prizes.some(p => p.sponsor !== "Tribu") || prizesInput.trim() !== "" ? (
                   <button 
                     type="button"
                     onClick={clearPrizes} 
                     className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-100 shadow-sm flex items-center gap-2" 
                     title="Borrar TODA la lista de negocios"
                   >
                     <Trash2 className="w-4 h-4" />
                     <span className="text-[9px] font-black uppercase tracking-widest">Borrar Todo</span>
                   </button>
                ) : null}
              </div>
              <div className="space-y-4">
                <button type="button" onClick={() => prizeFileInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-slate-100 rounded-[1.5rem] flex items-center justify-center gap-3 text-slate-400 hover:bg-indigo-50/50 hover:border-indigo-100 transition-all group/btn">
                  <Upload className="w-4 h-4 text-indigo-400 group-hover/btn:scale-110 transition-transform" />
                  <span className="font-black text-[10px] uppercase tracking-widest text-slate-600">Importar Excel de Negocios</span>
                </button>
                <textarea className="w-full h-24 p-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-xs font-bold outline-none resize-none focus:border-indigo-200 transition-all" placeholder="Empresa : Premio (Uno por línea)" value={prizesInput} onChange={(e) => setPrizesInput(e.target.value)} />
              </div>
            </div>
            <button type="button" onClick={handlePrizeUpdateManual} className="w-full bg-slate-900 text-white py-3 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg active:scale-95 mt-4">Sincronizar Lista</button>
            <input type="file" ref={prizeFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileChange(e, 'prizes')} />
          </section>
        </div>

        {/* GANADORES */}
        <section className="bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-2xl">
                <Trophy className="text-amber-600 w-6 h-6" />
              </div>
              <h3 className="text-xl font-black uppercase text-slate-900 tracking-tighter">Registro de Ganadores</h3>
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{winners.length} Premiados en total</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] border-b">
                <tr>
                  <th className="px-10 py-5">Ronda</th>
                  <th className="px-10 py-5">Ganador</th>
                  <th className="px-10 py-5">Premio</th>
                  <th className="px-10 py-5">Empresa Sponsor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {winners.map(w => (
                  <tr key={w.id} className="hover:bg-indigo-50/10 transition-all group">
                    <td className="px-10 py-6">
                       <span className="font-black text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-xl border border-indigo-100 text-lg">#{w.round}</span>
                    </td>
                    <td className="px-10 py-6">
                      <div className="font-black text-slate-900 uppercase text-xl group-hover:text-indigo-600 transition-colors mb-1">{w.nombre}</div>
                      <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-2"><Phone className="w-3 h-3" /> {w.celular}</div>
                    </td>
                    <td className="px-10 py-6">
                      <div className="font-black text-indigo-950 italic text-xl leading-tight">"{w.prize}"</div>
                    </td>
                    <td className="px-10 py-6">
                      <div className="font-black text-slate-950 uppercase text-[9px] tracking-widest flex items-center gap-2 bg-slate-100/50 px-4 py-2 rounded-lg inline-flex border border-slate-200">
                        <Building2 className="w-4 h-4 text-indigo-500" /> {w.sponsor}
                      </div>
                    </td>
                  </tr>
                ))}
                {winners.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-slate-300 font-black uppercase text-sm tracking-[0.5em] italic opacity-40">Sin ganadores registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="py-10 text-center opacity-30 mt-auto flex flex-col items-center gap-4">
         <Zap className="w-6 h-6 text-indigo-600 fill-current" />
         <span className="font-black text-[8px] uppercase tracking-[0.8em]">Tribu Engine v8.6 • Premium Raffle Experience</span>
      </footer>
    </div>
  );
};

export default App;
