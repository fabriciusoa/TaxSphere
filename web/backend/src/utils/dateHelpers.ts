import { format, parseISO } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Converte Date para string ISO8601 no timezone brasileiro
 */
export function toISO8601(date: Date): string {
  const zonedDate = utcToZonedTime(date, TIMEZONE);
  return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
}

/**
 * Converte string ISO8601 para Date no timezone brasileiro
 */
export function fromISO8601(isoString: string): Date {
  const date = parseISO(isoString);
  return utcToZonedTime(date, TIMEZONE);
}

/**
 * Retorna data/hora atual no timezone brasileiro em formato ISO8601
 */
export function getCurrentTimestamp(): string {
  const agora = new Date();
  const zonedDate = utcToZonedTime(agora, TIMEZONE);
  return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
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
 * Formata data para exibição em formato brasileiro: DD/MM/YYYY HH:mm
 */
export function formatToBrazilian(isoString: string | null): string | null {
  if (!isoString) return null;

  try {
    const date = fromISO8601(isoString);
    return format(date, 'dd/MM/yyyy HH:mm');
  } catch (error) {
    return null;
  }
}

/**
 * Formata apenas a data para formato brasileiro: DD/MM/YYYY
 */
export function formatDateToBrazilian(isoString: string | null): string | null {
  if (!isoString) return null;

  try {
    const date = fromISO8601(isoString);
    return format(date, 'dd/MM/yyyy');
  } catch (error) {
    return null;
  }
}

/**
 * Adiciona minutos a uma data
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Adiciona horas a uma data
 */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000);
}

/**
 * Verifica se uma data é anterior a outra
 */
export function isBefore(date1: Date, date2: Date): boolean {
  return date1.getTime() < date2.getTime();
}

/**
 * Verifica se uma data é posterior a outra
 */
export function isAfter(date1: Date, date2: Date): boolean {
  return date1.getTime() > date2.getTime();
}
