import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Stack,
  Alert,
  Button,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import chamadosService from '../services/chamadosService';
import { logger } from '../utils/logger';

interface FileWithPreview extends File {
  preview?: string;
}

interface AnexosUploadProps {
  idComentario: number;
  onUploadSuccess?: () => void | Promise<void>;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default function AnexosUpload({ idComentario, onUploadSuccess }: AnexosUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [erro, setErro] = useState<string>('');
  const [sucesso, setSucesso] = useState<string>('');

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setErro('');
    setSucesso('');

    // Validação: máximo 5 arquivos
    if (files.length + acceptedFiles.length > MAX_FILES) {
      setErro(`Máximo de ${MAX_FILES} arquivos por comentário`);
      return;
    }

    // Processar arquivos aceitos
    const newFiles: FileWithPreview[] = acceptedFiles.map(file => {
      const fileWithPreview = Object.assign(file, {
        preview: file.type.startsWith('image/') 
          ? URL.createObjectURL(file) 
          : undefined
      });
      return fileWithPreview;
    });

    setFiles(prev => [...prev, ...newFiles]);

    // Tratar arquivos rejeitados
    if (rejectedFiles.length > 0) {
      const reasons = rejectedFiles.map(f => f.errors[0]?.message).join(', ');
      setErro(`Arquivos rejeitados: ${reasons}`);
    }
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
    disabled: files.length >= MAX_FILES || uploading
  });

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      const removed = newFiles.splice(index, 1)[0];
      if (removed.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return newFiles;
    });
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon />;
    if (file.type === 'application/pdf') return <PictureAsPdfIcon color="error" />;
    if (file.type.includes('word')) return <DescriptionIcon color="primary" />;
    return <InsertDriveFileIcon />;
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setErro('');
    setSucesso('');
    setUploadProgress(0);

    try {
      const result = await chamadosService.uploadAnexos(
        idComentario,
        files,
        (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      );

      setSucesso(result.message);
      
      // Limpar arquivos e previews
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      setFiles([]);
      setUploadProgress(0);

      // Chamar callback de sucesso
      if (onUploadSuccess) {
        await onUploadSuccess();
      }
      setTimeout(() => {
        setSucesso('');
      }, 2000);

    } catch (error: any) {
      logger.error('Erro ao enviar anexos', { error: error.message, idComentario });
      setErro(error.response?.data?.error || 'Erro ao enviar arquivos');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  // Cleanup ao desmontar
  React.useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, []);

  return (
    <Box>
      {/* Dropzone */}
      <Paper
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.300',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          p: 3,
          textAlign: 'center',
          cursor: files.length >= MAX_FILES || uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          opacity: files.length >= MAX_FILES || uploading ? 0.5 : 1,
          '&:hover': {
            borderColor: files.length >= MAX_FILES || uploading ? 'grey.300' : 'primary.main',
            bgcolor: files.length >= MAX_FILES || uploading ? 'background.paper' : 'action.hover'
          }
        }}
      >
        <input {...getInputProps()} />
        <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive 
            ? 'Solte os arquivos aqui...' 
            : 'Arraste arquivos ou clique para selecionar'
          }
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Máximo {MAX_FILES} arquivos por comentário ({files.length}/{MAX_FILES})
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Aceito: Imagens, PDF, DOC/DOCX (máx. 5MB cada)
        </Typography>
      </Paper>

      {/* Mensagem de erro */}
      {erro && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setErro('')}>
          {erro}
        </Alert>
      )}

      {/* Mensagem de sucesso */}
      {sucesso && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSucesso('')}>
          {sucesso}
        </Alert>
      )}

      {/* Lista de arquivos selecionados */}
      {files.length > 0 && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          <Typography variant="subtitle2">
            Arquivos selecionados ({files.length})
          </Typography>
          {files.map((file, index) => (
            <Paper
              key={`${file.name}-${index}`}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              {/* Preview de imagem ou ícone */}
              {file.preview ? (
                <Box
                  component="img"
                  src={file.preview}
                  sx={{
                    width: 60,
                    height: 60,
                    objectFit: 'cover',
                    borderRadius: 1
                  }}
                  alt={file.name}
                />
              ) : (
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.100',
                    borderRadius: 1
                  }}
                >
                  {getFileIcon(file)}
                </Box>
              )}

              {/* Info do arquivo */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" noWrap>
                  {file.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatBytes(file.size)}
                </Typography>
              </Box>

              {/* Botão remover */}
              <IconButton
                size="small"
                color="error"
                onClick={() => removeFile(index)}
                disabled={uploading}
              >
                <DeleteIcon />
              </IconButton>
            </Paper>
          ))}

          {/* Progress bar durante upload */}
          {uploading && (
            <Box sx={{ width: '100%' }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Enviando... {uploadProgress}%
              </Typography>
            </Box>
          )}

          {/* Botão de enviar */}
          <Button
            variant="contained"
            fullWidth
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            startIcon={<CloudUploadIcon />}
          >
            {uploading ? 'Enviando...' : `Enviar ${files.length} arquivo(s)`}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
