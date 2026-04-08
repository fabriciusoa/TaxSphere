/**
 * Converte números de 0 a 999 em extenso
 */
export function numeroParaExtenso(numero: number): string {
  if (numero < 0 || numero > 10000) {
    return numero.toString();
  }

  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dez = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const milhares = ['', 'um mil', 'dois mil', 'três mil', 'quatro mil', 'cinco mil', 'seis mil', 'sete mil', 'oito mil', 'nove mil'];

  if (numero === 0) return 'zero';
  if (numero === 100) return 'cem';
  if (numero === 1000) return 'mil';

  let extenso = '';
  
  // Milhares
  const m = Math.floor(numero / 1000);
  const resto = numero % 1000;

  if (m > 0) {
    extenso = milhares[m];
    if (resto > 0) extenso += ' e ';
  }

  // Centenas
  const c = Math.floor(resto / 100);
  const restoCentenas = resto % 100;
  if (c > 0) {
    extenso += centenas[c];
    if (restoCentenas > 0) extenso += ' e ';
  }

  // Dezenas
  const d = Math.floor(restoCentenas / 10);
  const u = restoCentenas % 10;

  if (d === 1) {
    extenso += dez[u];
  } else {
    if (d > 0) {
      extenso += dezenas[d];
      if (u > 0) extenso += ' e ';
    }
    if (u > 0) {
      extenso += unidades[u];
    }
  }

  return extenso.trim();
}
