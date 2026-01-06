
export interface Participant {
  id: string;
  fecha: string;
  nombre: string;
  celular: string;
  ticket: string; // Usado para "Negocio" o código de ticket
  premio_asignado?: string;
  negocio_nombre?: string;
}

export interface Prize {
  sponsor: string;
  description: string;
  sponsorPhone?: string;
}

export interface Winner extends Participant {
  wonAt: Date;
  round: number;
  prize: string;
  sponsor: string;
  sponsorPhone?: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  MAPPING = 'MAPPING',
  READY = 'READY',
  SPINNING = 'SPINNING',
  WINNER_REVEALED = 'WINNER_REVEALED'
}
