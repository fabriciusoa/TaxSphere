import { format, parseISO, addMinutes } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Converte string ISO8601 do backend para Date
 * O backend já envia as datas no timezone brasileiro
 */
export function fromISO8601(isoString: string | null): Date | null {
  if (!isoString) return null;
  
  try {
    return parseISO(isoString);
  } catch (error) {
    return null;
  }
}

/**
 * Formata data ISO8601 para formato brasileiro: DD/MM/YYYY HH:mm
 */
export function formatToBrazilian(isoString: string | null): string | null {
  if (!isoString) return null;
  
  const date = fromISO8601(isoString);
  if (!date) return null;
  
  return format(date, 'dd/MM/yyyy HH:mm');
}

/**
 * Formata apenas a data para formato brasileiro: DD/MM/YYYY
 */
export function formatDateToBrazilian(isoString: string | null): string | null {
  if (!isoString) return null;
  
  const date = fromISO8601(isoString);
  if (!date) return null;
  
  return format(date, 'dd/MM/yyyy');
}

/**
 * Converte Date para string ISO8601 com timezone brasileiro
 */
export function toISO8601(date: Date): string {
  const zonedDate = zonedTimeToUtc(date, TIMEZONE);
  return zonedDate.toISOString();
}

/**
 * Formata data no formato YYYY-MM-DD para DD/MM/YYYY
 */
export function formatarData(data: string | null): string {
  if (!data) return '';
  
  // Se já está no formato brasileiro, retorna
  if (data.includes('/')) return data;
  
  // Converte YYYY-MM-DD para DD/MM/YYYY
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Calcula a idade a partir da data de nascimento no formato YYYY-MM-DD
 */
  export function calcularIdade(dataNascimento: string): number {
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mes = hoje.getMonth() - nascimento.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
      idade--;
    }
    return idade;
};

/**
 * Calcula a data de término estimada a partir da data de início
 */
export function calcularDataFim(dataInicio: Date | null): string {
  if (!dataInicio) return '-';
  const dataFim = addMinutes(dataInicio, 60); // Padrão 60 minutos
  return format(dataFim, 'dd/MM/yyyy HH:mm');
}

export function  formatarHora(hora: string): string {
    // Assumindo formato HH:mm ou HH:mm:ss
    if (hora.length >= 5) {
      return hora.substring(0, 5);
    }
    return hora;
  };
