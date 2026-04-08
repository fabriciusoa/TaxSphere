import { useState } from 'react';
import {
  Paper,
  Typography,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import Lightbox from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import { chamadosService } from '../services/chamadosService';
import type { ChamadoAnexo } from '../types';

interface AnexosGaleriaProps {
  anexos: ChamadoAnexo[];
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default function AnexosGaleria({ anexos }: AnexosGaleriaProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  if (!anexos || anexos.length === 0) {
    return null;
  }

  // Filtrar imagens para o lightbox (apenas as que têm base64 disponível)
  const imagensAnexos = anexos.filter(a => a.tipo_arquivo.startsWith('image/') && a.preview_base64);
  const slides = imagensAnexos.map(a => ({
    // Padrão idêntico ao MeuPerfil: data URL base64 diretamente no src
    src: `data:image/jpeg;base64,${a.preview_base64}`,
    thumbnail: a.thumbnail_base64 ? `data:image/jpeg;base64,${a.thumbnail_base64}` : `data:image/jpeg;base64,${a.preview_base64}`,
    title: a.nome_arquivo,
  }));

  const handleDownload = (anexo: ChamadoAnexo) => {
    chamadosService.downloadAnexo(anexo.id, anexo.nome_arquivo);
  };

  const getFileIcon = (tipoArquivo: string) => {
    if (tipoArquivo === 'application/pdf') {
      return <PictureAsPdfIcon sx={{ fontSize: 48, color: 'error.main' }} />;
    }
    if (tipoArquivo.includes('word')) {
      return <DescriptionIcon sx={{ fontSize: 48, color: 'primary.main' }} />;
    }
    return <InsertDriveFileIcon sx={{ fontSize: 48 }} />;
  };

  // Encontrar índice da imagem no array de slides
  const getSlideIndex = (anexoId: number): number => {
    return imagensAnexos.findIndex(a => a.id === anexoId);
  };

  return (
    <>
      {/* Grid de anexos */}
      <ImageList sx={{ width: '100%', height: 'auto' }} cols={4} gap={8}>
        {anexos.map((anexo) => {
          const isImage = anexo.tipo_arquivo.startsWith('image/');

          if (isImage) {
            return (
              <ImageListItem key={anexo.id}>
                <img
                  // Padrão idêntico ao MeuPerfil: data URL base64 direto no src
                  src={anexo.thumbnail_base64
                    ? `data:image/jpeg;base64,${anexo.thumbnail_base64}`
                    : `data:image/jpeg;base64,${anexo.preview_base64}`}
                  alt={anexo.nome_arquivo}
                  loading="lazy"
                  style={{
                    height: 140,
                    width: 140,
                    objectFit: 'cover',
                    cursor: 'pointer',
                    borderRadius: 6,
                  }}
                  onClick={() => setLightboxIndex(getSlideIndex(anexo.id))}
                />
                <ImageListItemBar
                  position="below"
                  subtitle={`${anexo.nome_arquivo} - ${formatBytes(anexo.tamanho_bytes)}`}
                  actionIcon={
                    <IconButton
                      sx={{ color: 'primary.main' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(anexo);
                      }}
                    >
                      <DownloadIcon />
                    </IconButton>
                  }
                />
              </ImageListItem>
            );
          }

          // Não é imagem - renderizar card com ícone
          return (
            <ImageListItem key={anexo.id}>
              <Paper
                sx={{
                  p: 2,
                  height: 100,
                  width: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  bgcolor: 'grey.100',
                  borderRadius: 6,
                  '&:hover': {
                    bgcolor: 'grey.200',
                  },
                }}
                onClick={() => handleDownload(anexo)}
              >
                {getFileIcon(anexo.tipo_arquivo)}
                <Typography
                  variant="caption"
                  align="center"
                  noWrap
                  sx={{ mt: 1, width: '100%', px: 1 }}
                >
                  {anexo.nome_arquivo}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatBytes(anexo.tamanho_bytes)}
                </Typography>
              </Paper>
            </ImageListItem>
          );
        })}
      </ImageList>

      {/* Meta informação */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {anexos.length} anexo(s) - {formatBytes(anexos.reduce((sum, a) => sum + a.tamanho_bytes, 0))} total
      </Typography>

      {/* Lightbox para imagens */}
      {imagensAnexos.length > 0 && (
        <Lightbox
          open={lightboxIndex >= 0}
          close={() => setLightboxIndex(-1)}
          index={lightboxIndex}
          slides={slides}
          plugins={[Thumbnails, Zoom]}
        />
      )}
    </>
  );
}
