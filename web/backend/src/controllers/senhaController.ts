import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';

export const alterarSenha = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { senhaAtual, novaSenha } = req.body;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ message: 'Senha atual e nova senha são obrigatórias' });
    }

    // Buscar usuário
		const usuario = await getOne<any>('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Verificar se o usuário está ativo
    if (usuario.status.toLowerCase() !== 'ativo') {
      return res.status(403).json({ message: 'Usuário inativo' });
    }

    // Verificar senha atual
    const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ message: 'Senha atual incorreta' });
    }

    // Validar nova senha
    if (novaSenha.length < 8) {
      return res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres' });
    }

    if (!/[a-z]/.test(novaSenha)) {
      return res.status(400).json({ message: 'A nova senha deve conter pelo menos uma letra minúscula' });
    }

    if (!/[A-Z]/.test(novaSenha)) {
      return res.status(400).json({ message: 'A nova senha deve conter pelo menos uma letra maiúscula' });
    }

    if (!/[\W_]/.test(novaSenha)) {
      return res.status(400).json({ message: 'A nova senha deve conter pelo menos um caractere especial' });
    }

    // Hash da nova senha
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    // Atualizar senha
		await runQuery('UPDATE usuarios SET senha = $1 WHERE id = $2', [novaSenhaHash, id]);
    return res.json({ message: 'Senha alterada com sucesso' });
  } catch (error: any) {
    log.error(`Erro ao alterar senha: ${error.message}`);
    return res.status(500).json({ message: 'Erro ao alterar senha' });
  }
};
