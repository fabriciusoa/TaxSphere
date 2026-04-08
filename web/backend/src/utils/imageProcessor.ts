import sharp from 'sharp';
import { log } from '../utils/logger';
/**
 * Interface para imagem processada com preview e thumbnail
 */
interface ProcessedImage {
  preview: Buffer;      // 800x600, quality 90%
  thumbnail: Buffer;    // 200x200, quality 85%
}

/**
 * Processa uma imagem gerando versão preview (800x600) e thumbnail (200x200)
 * @param buffer Buffer do arquivo de imagem
 * @param mimeType Tipo MIME do arquivo
 * @returns Objeto com preview e thumbnail, ou null se não for imagem
 */
export async function processImage(
  buffer: Buffer,
  mimeType: string
): Promise<ProcessedImage | null> {
  // Verificar se é imagem
  if (!mimeType.startsWith('image/')) {
    return null; // Não é imagem, retornar null
  }

  try {
    // Obter metadados da imagem
    const image = sharp(buffer);
    const metadata = await image.metadata();

    log.info(
      `Processando imagem: ${metadata.width}x${metadata.height}, formato: ${metadata.format}`
    );

    // PREVIEW: 800x600, quality 90%, fit: inside (mantém proporção)
    const preview = await sharp(buffer)
      .resize(800, 600, {
        fit: 'inside',           // Mantém proporção, não corta
        withoutEnlargement: true // Não aumenta imagens pequenas
      })
      .jpeg({
        quality: 90,
        progressive: true,
        mozjpeg: true            // Melhor compressão
      })
      .toBuffer();

    // THUMBNAIL: 200x200, quality 85%, fit: cover (pode cortar)
    const thumbnail = await sharp(buffer)
      .resize(200, 200, {
        fit: 'cover',            // Preenche 200x200, corta se necessário
        position: 'center'       // Corta do centro
      })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    log.info(
      `Imagem processada - Preview: ${formatBytes(preview.length)}, Thumbnail: ${formatBytes(thumbnail.length)}`
    );

    return { preview, thumbnail };
  } catch (error: any) {
    log.error(`Erro ao processar imagem com Sharp: ${error.message}`);
    throw new Error('Falha ao processar imagem');
  }
}

/**
 * Verifica se o tipo MIME é de uma imagem
 * @param mimeType Tipo MIME a verificar
 * @returns true se for imagem, false caso contrário
 */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Formata bytes em formato legível (KB, MB, GB)
 * @param bytes Quantidade de bytes
 * @returns String formatada (ex: "2.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
