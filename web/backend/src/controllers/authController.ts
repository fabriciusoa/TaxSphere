import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getOne, runQuery, beginTransaction, commitTransaction, rollbackTransaction, getAll } from '../database/connection';
import { Usuario, Parametro, AuthRequest, JWTPayload, UserModulos, UserFuncionalidade } from '../types';
import { loginSchema } from '../validators/schemas';
import { getCurrentTimestamp, fromISO8601, addMinutes, isBefore } from '../utils/dateHelpers';
import { recordLoginFailure, resetLoginFailures } from '../middleware/adaptiveRateLimit';
import { log } from '../utils/logger';

export const authController = {

  validate_reset: async (req: Request, res: Response) => {
    const { email, cpf } = req.body;

    if (!email || !cpf) {
      return res.status(400).json({ error: 'E-mail e CPF são obrigatórios' });
    }

    try {
      const usuario = await getOne<Usuario>(
        'SELECT * FROM adm_usuarios WHERE email = $1',
        [email]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (usuario.cpf !== cpf) {
        return res.status(401).json({ error: 'E-mail e CPF não conferem' });
      }

      res.json({ valid: true });
    } catch (error: any) {
      log.error(`Erro ao validar reset: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Reset de senha sem autenticação (valida email + cpf)
  reset_password: async (req: Request, res: Response) => {
    try {
      const { email, cpf, newPassword } = req.body;

      if (!email || !cpf || !newPassword) {
        return res.status(400).json({ error: 'E-mail, CPF e nova senha são obrigatórios' });
      }

      // Políticas mínimas de senha
      const hasLength = typeof newPassword === 'string' && newPassword.length >= 8;
      const hasNumber = /[0-9]/.test(newPassword);
      const hasLower = /[a-z]/.test(newPassword);
      const hasUpper = /[A-Z]/.test(newPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

      if (!(hasLength && hasNumber && hasLower && hasUpper && hasSpecial)) {
        return res.status(400).json({ error: 'A senha não atende aos critérios de segurança' });
      }

      const usuario = await getOne<Usuario>('SELECT * FROM adm_usuarios WHERE email = $1', [email]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (usuario!.cpf !== cpf) {
        return res.status(401).json({ error: 'E-mail e CPF não conferem' });
      }

      if (!usuario!.status) {
        return res.status(403).json({ error: 'Conta inativa' });
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await runQuery('UPDATE adm_usuarios SET senha = $1, tentativas_login = 0, dt_bloqueio = NULL WHERE id = $2', [hash, usuario!.id]);

      return res.status(200).json({ message: 'Senha alterada com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao resetar senha: ${error.message}`);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
  // Login
  login: async (req: Request, res: Response) => {
    try {
      log.info(`Login attempt: ${req.body.email}`);

      // Validar entrada
      const resultado = loginSchema.safeParse(req.body);
      if (!resultado.success) {
        log.error(`Validation error: ${JSON.stringify(resultado.error.errors)}`);
        return res.status(400).json({ errors: resultado.error.errors });
      }

      const { email, senha } = resultado.data;
      log.info(`Email: ${email}`);
      const ip = req.ip || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      // Buscar parâmetros
      const limiteTentativas = await getOne<Parametro>(
        'SELECT * FROM sys_parametros WHERE chave = $1',
        ['limite_tentativas_login']
      );
      const tempoBloqueio = await getOne<Parametro>(
        'SELECT * FROM sys_parametros WHERE chave = $1',
        ['tempo_bloqueio_minutos']
      );
      const tempoSessao = await getOne<Parametro>(
        'SELECT * FROM sys_parametros WHERE chave = $1',
        ['tempo_sessao_horas']
      );

      const limite = parseInt(limiteTentativas?.valor || '5');
      const bloqueioMinutos = parseInt(tempoBloqueio?.valor || '30');
      const sessaoHoras = parseInt(tempoSessao?.valor || '8');

      // Buscar usuário
      const usuario = await getOne<Usuario>(
        'SELECT * FROM adm_usuarios WHERE email = $1',
        [email]
      );

      log.info(`Usuario found: ${usuario ? 'Yes' : 'No'}`);
      if (usuario) {
        log.info(`Usuario status: ${usuario.status}`);
        log.info(`Usuario dt_bloqueio: ${usuario.dt_bloqueio}`);
      }

      if (!usuario) {
        // Registrar tentativa falha - usuário não encontrado
        await runQuery(
          `INSERT INTO sys_login_log (usuario_id, email_tentativa, sucesso, ip_address, user_agent, motivo_falha, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [null, email, false, ip, userAgent, 'usuario_nao_encontrado', getCurrentTimestamp()]
        );
        // Rastrear falha por IP (detecção de credential stuffing)
        if (ip) recordLoginFailure(ip);
        return res.status(401).json({ error: 'Email ou senha inválidos' });
      }

      // Verificar se conta está ativa
      if (!usuario.status) {
        await runQuery(
          `INSERT INTO sys_login_log (usuario_id, email_tentativa, sucesso, ip_address, user_agent, motivo_falha, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [usuario.id, email, false, ip, userAgent, 'conta_inativa', getCurrentTimestamp()]
        );
        return res.status(403).json({ error: 'Conta inativa' });
      }

      // Verificar se conta está bloqueada
      if (usuario.dt_bloqueio) {
        const dataBloqueio = fromISO8601(usuario.dt_bloqueio);
        const dataExpiracao = addMinutes(dataBloqueio, bloqueioMinutos);
        const agora = new Date();

        if (isBefore(agora, dataExpiracao)) {
          await runQuery(
            `INSERT INTO sys_login_log (usuario_id, email_tentativa, sucesso, ip_address, user_agent, motivo_falha, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [usuario.id, email, false, ip, userAgent, 'conta_bloqueada', getCurrentTimestamp()]
          );

          const minutosRestantes = Math.ceil((dataExpiracao.getTime() - agora.getTime()) / 60000);
          log.error(`Conta bloqueada: ${email}, IP: ${ip}, User-Agent: ${userAgent}, minutos restantes: ${minutosRestantes}`);
          return res.status(403).json({
            error: 'Conta bloqueada',
            message: `Conta bloqueada por tentativas excessivas. Tente novamente em ${minutosRestantes} minutos.`
          });
        } else {
          // Bloqueio expirou, resetar
          await runQuery(
            'UPDATE adm_usuarios SET tentativas_login = 0, dt_bloqueio = NULL WHERE id = $1',
            [usuario.id]
          );
        }
      }

      // Validar senha
      const senhaValida = await bcrypt.compare(senha, usuario.senha);

      if (!senhaValida) {
        // Incrementar tentativas
        const novasTentativas = usuario.tentativas_login + 1;

        if (novasTentativas >= limite) {
          // Bloquear conta
          const txClient = await beginTransaction();
          try {
            await runQuery(
              'UPDATE adm_usuarios SET tentativas_login = $1, dt_bloqueio = $2 WHERE id = $3',
              [novasTentativas, getCurrentTimestamp(), usuario.id],
              txClient
            );

            await runQuery(
              `INSERT INTO sys_login_log (usuario_id, email_tentativa, sucesso, ip_address, user_agent, motivo_falha, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [usuario.id, email, false, ip, userAgent, 'senha_invalida_bloqueio', getCurrentTimestamp()],
              txClient
            );
            await commitTransaction(txClient);
          } catch (txErr) {
            await rollbackTransaction(txClient);
            throw txErr;
          }
          if (ip) recordLoginFailure(ip);
          log.error(`Conta bloqueada: ${email}, IP: ${ip}, User-Agent: ${userAgent}, limite de tentativas excedido`);

          return res.status(403).json({
            error: 'Conta bloqueada',
            message: `Conta bloqueada por exceder o limite de tentativas. Tente novamente em ${bloqueioMinutos} minutos.`
          });
        } else {
          // Apenas incrementar tentativas
          await runQuery(
            'UPDATE adm_usuarios SET tentativas_login = $1 WHERE id = $2',
            [novasTentativas, usuario.id]
          );

          await runQuery(
            `INSERT INTO sys_login_log (usuario_id, email_tentativa, sucesso, ip_address, user_agent, motivo_falha, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [usuario.id, email, false, ip, userAgent, 'senha_invalida', getCurrentTimestamp()]
          );
          if (ip) recordLoginFailure(ip);
          log.error(`Senha inválida: ${email}, IP: ${ip}, User-Agent: ${userAgent}, tentativas restantes: ${limite - novasTentativas}`);

          const tentativasRestantes = limite - novasTentativas;
          return res.status(401).json({
            error: 'Email ou senha inválidos',
            message: `Credenciais inválidas. ${tentativasRestantes} tentativa(s) restante(s).`
          });
        }
      }

      // Verifica se o usuário é administrador geral do sistema
      const perfilADM = await getOne<{ adm_mindtax: boolean }>(
        'SELECT distinct ap.adm_mindtax FROM adm_usuarios_perfil aup, adm_perfil ap WHERE aup.usuario_id = $1 and aup.perfil_id = ap.id limit 1',
        [usuario.id]
      );
      // Verificar se há manutenção em andamento — bloqueia não-admins
      if (!perfilADM?.adm_mindtax) {
        const manutencaoAtiva = await getOne<{ descricao: string; dt_fim: string | null }>(
          `SELECT descricao, dt_fim FROM sys_manutencao
           WHERE status = 'em_execucao' AND excluded_at IS NULL
           LIMIT 1`
        );
        if (manutencaoAtiva) {
          const dtFimMsg = manutencaoAtiva.dt_fim
            ? ` até ${new Date(manutencaoAtiva.dt_fim).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}`
            : '';
          return res.status(403).json({
            error: 'manutencao_em_execucao',
            message: `Sistema em manutenção${dtFimMsg}. Tente novamente mais tarde.`
          });
        }
      }

      //validar o permissionamento do usuário, permissões mais granulares
      let user_modulos: UserModulos[] | undefined;

      user_modulos = await getAll<UserModulos>(`
            select distinct au.id usuario_id,
                    ap.perfil,
                    ap.adm_mindtax,
                    sm.id modulo_id,
                    sm.modulo
              from adm_usuarios_perfil aup
            inner join adm_usuarios au on au.id = aup.usuario_id
            inner join adm_perfil ap on ap.id = aup.perfil_id
              left join adm_perfil_permissao app on app.perfil_id = ap.id
              left join sys_funcionalidade sf on sf.id = app.funcionalidade_id
              left join sys_modulo sm on sm.id = sf.modulo_id
            where au.id = $1
              and aup.dt_inativacao is null
          `, [usuario.id]);

      // Buscar funcionalidades de cada módulo
      user_modulos = await Promise.all(
        user_modulos.map(async (modulo) => {
          const funcionalidades = await getAll<UserFuncionalidade>(
            ` select distinct
                    aup.usuario_id,
                    sm.modulo,
                    sf.funcionalidade,
                    app.inserir,
                    app.excluir,
                    app.consultar,
                    app.alterar
                  from adm_usuarios_perfil aup
                inner join adm_usuarios au on au.id = aup.usuario_id
                inner join adm_perfil ap on ap.id = aup.perfil_id
                  left join adm_perfil_permissao app on app.perfil_id = ap.id
                  left join sys_funcionalidade sf on sf.id = app.funcionalidade_id
                  left join sys_modulo sm on sm.id = sf.modulo_id
                where aup.dt_inativacao is null
            and sm.modulo is not null
            and aup.usuario_id = $1
            and sm.id = $2`,
            [usuario.id, modulo.modulo_id]
          );
          return { ...modulo, user_funcionalidade: funcionalidades };
        })
      );

      // Login bem-sucedido - resetar tentativas e atualizar último login
      const txClient = await beginTransaction();
      try {
        await runQuery(
          'UPDATE adm_usuarios SET tentativas_login = 0, dt_bloqueio = NULL, ultimo_login = $1 WHERE id = $2',
          [getCurrentTimestamp(), usuario.id],
          txClient
        );
        // Resetar histórico de falhas do IP (comportamento legítimo confirmado)
        if (ip) resetLoginFailures(ip);

        // Registrar login bem-sucedido
        await runQuery(
          `INSERT INTO sys_login_log (usuario_id, email_tentativa, sucesso, ip_address, user_agent, motivo_falha, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [usuario.id, email, true, ip, userAgent, null, getCurrentTimestamp()],
          txClient
        );
        await commitTransaction(txClient);
      } catch (txErr) {
        await rollbackTransaction(txClient);
        throw txErr;
      }

      // Gerar JWT
      const payload: JWTPayload = {
        id: usuario.id,
        email: usuario.email,
        user_modulos: user_modulos,
        adm_mindtax: perfilADM?.adm_mindtax || false
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: `${sessaoHoras}h`
      });

      // Setar token como cookie httpOnly (SEC-04)
      // sameSite: 'lax' em dev pois o proxy do Vite não propaga bem cookies Strict
      // sameSite: 'strict' em produção (mesma origem real, sem proxy)
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: sessaoHoras * 3600000
      });

      // Retornar apenas dados do usuário (token nunca vai para o body)
      res.json({
        user: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          cpf: usuario.cpf,
          status: usuario.status,
          adm_mindtax: perfilADM?.adm_mindtax || false,
          user_modulos: user_modulos
        }
      });
    } catch (error: any) {
      log.error(`Erro no login: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Refresh token
  refresh: async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      // Buscar usuário no banco
      const usuario = await getOne<Usuario>(
        'SELECT * FROM adm_usuarios WHERE id = $1',
        [req.user.id]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Verificar se conta está ativa (LOWER para compatibilidade 'Ativo'/'ativo')
      if (!usuario.status) {
        return res.status(403).json({ error: 'Conta inativa. Não é possível renovar a sessão.' });
      }

      // Verificar se conta está bloqueada
      if (usuario.dt_bloqueio) {
        const tempoBloqueio = await getOne<Parametro>(
          'SELECT * FROM sys_parametros WHERE chave = $1',
          ['tempo_bloqueio_minutos']
        );
        const bloqueioMinutos = parseInt(tempoBloqueio?.valor || '30');
        const dataBloqueio = fromISO8601(usuario.dt_bloqueio);
        const dataExpiracao = addMinutes(dataBloqueio, bloqueioMinutos);
        const agora = new Date();

        if (isBefore(agora, dataExpiracao)) {
          return res.status(403).json({ error: 'Conta bloqueada. Não é possível renovar a sessão.' });
        }
      }

      // Buscar tempo de sessão
      const tempoSessao = await getOne<Parametro>(
        'SELECT * FROM sys_parametros WHERE chave = $1',
        ['tempo_sessao_horas']
      );
      const sessaoHoras = parseInt(tempoSessao?.valor || '8');

      // Verifica se o usuário é administrador geral do sistema
      const perfilADM = await getOne<{ adm_mindtax: boolean }>(
        'SELECT distinct ap.adm_mindtax FROM adm_usuarios_perfil aup, adm_perfil ap WHERE aup.usuario_id = $1 and aup.perfil_id = ap.id limit 1',
        [usuario.id]
      );

      //validar o permissionamento do usuário, permissões mais granulares
      let user_modulos: UserModulos[] | undefined;
      try {
        user_modulos = await getAll<UserModulos>(`
            select distinct au.id usuario_id,
                    ap.perfil,
                    ap.adm_mindtax,
                    sm.id modulo_id,
                    sm.modulo
              from adm_usuarios_perfil aup
            inner join adm_usuarios au on au.id = aup.usuario_id
            inner join adm_perfil ap on ap.id = aup.perfil_id
              left join adm_perfil_permissao app on app.perfil_id = ap.id
              left join sys_funcionalidade sf on sf.id = app.funcionalidade_id
              left join sys_modulo sm on sm.id = sf.modulo_id
            where au.id = $1
              and aup.dt_inativacao is null
          `, [usuario.id]);

        user_modulos = await Promise.all(
          user_modulos.map(async (modulo) => {
            const funcionalidades = await getAll<UserFuncionalidade>(
              ` select distinct
                    aup.usuario_id,
                    sm.modulo,
                    sf.funcionalidade,
                    app.inserir,
                    app.excluir,
                    app.consultar,
                    app.alterar
                  from adm_usuarios_perfil aup
                inner join adm_usuarios au on au.id = aup.usuario_id
                inner join adm_perfil ap on ap.id = aup.perfil_id
                  left join adm_perfil_permissao app on app.perfil_id = ap.id
                  left join sys_funcionalidade sf on sf.id = app.funcionalidade_id
                  left join sys_modulo sm on sm.id = sf.modulo_id
                where aup.dt_inativacao is null
            and sm.modulo is not null
            and aup.usuario_id = $1
            and sm.id = $2`,
              [usuario.id, modulo.modulo_id]
            );
            return { ...modulo, user_funcionalidade: funcionalidades };
          })
        );

      } catch (error: any) {
        log.error(`Erro ao buscar as permissões do usuário: ${error.message}`);
        res.status(500).json({ error: 'Erro ao buscar as permissões do usuário' });
      }

      // Gerar novo token
      const payload: JWTPayload = {
        id: usuario.id,
        email: usuario.email,
        user_modulos: user_modulos,
        adm_mindtax: perfilADM?.adm_mindtax || false
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: `${sessaoHoras}h`
      });

      // Renovar cookie httpOnly (SEC-04)
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: sessaoHoras * 3600000
      });

      res.json({ message: 'Sessão renovada' });
    } catch (error: any) {
      log.error(`Erro no refresh: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Retorna dados do usuário autenticado (fonte de verdade para o frontend)
  me: async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
      }

      // LOWER(status) = 'ativo' para compatibilidade com 'Ativo' e 'ativo' no banco
      const usuario = await getOne<Usuario>(
        'SELECT id, nome, email, cpf, status FROM adm_usuarios WHERE id = $1 AND status = $2',
        [req.user.id, true]
      );

      if (!usuario) {
        // Usuário foi inativado: limpar cookie
        res.clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
          path: '/'
        });
        return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
      }

      // Verifica se o usuário é administrador geral do sistema
      const perfilADM = await getOne<{ adm_mindtax: boolean }>(
        'SELECT distinct ap.adm_mindtax FROM adm_usuarios_perfil aup, adm_perfil ap WHERE aup.usuario_id = $1 and aup.perfil_id = ap.id limit 1',
        [usuario.id]
      );

      //validar o permissionamento do usuário, permissões mais granulares
      let user_modulos: UserModulos[] | undefined;
      try {
        user_modulos = await getAll<UserModulos>(`
            select distinct au.id usuario_id,
                    ap.perfil,
                    ap.adm_mindtax,
                    sm.id modulo_id,
                    sm.modulo
              from adm_usuarios_perfil aup
            inner join adm_usuarios au on au.id = aup.usuario_id
            inner join adm_perfil ap on ap.id = aup.perfil_id
              left join adm_perfil_permissao app on app.perfil_id = ap.id
              left join sys_funcionalidade sf on sf.id = app.funcionalidade_id
              left join sys_modulo sm on sm.id = sf.modulo_id
            where au.id = $1
              and aup.dt_inativacao is null
          `, [usuario.id]);

        user_modulos = await Promise.all(
          user_modulos.map(async (modulo) => {
            const funcionalidades = await getAll<UserFuncionalidade>(
              ` select distinct
                    aup.usuario_id,
                    sm.modulo,
                    sf.funcionalidade,
                    app.inserir,
                    app.excluir,
                    app.consultar,
                    app.alterar
                  from adm_usuarios_perfil aup
                inner join adm_usuarios au on au.id = aup.usuario_id
                inner join adm_perfil ap on ap.id = aup.perfil_id
                  left join adm_perfil_permissao app on app.perfil_id = ap.id
                  left join sys_funcionalidade sf on sf.id = app.funcionalidade_id
                  left join sys_modulo sm on sm.id = sf.modulo_id
                where aup.dt_inativacao is null
            and sm.modulo is not null
            and aup.usuario_id = $1
            and sm.id = $2`,
              [usuario.id, modulo.modulo_id]
            );
            return { ...modulo, user_funcionalidade: funcionalidades };
          })
        );

      } catch (error: any) {
        log.error(`Erro ao buscar as permissões do usuário: ${error.message}`);
        res.status(500).json({ error: 'Erro ao buscar as permissões do usuário' });
      }

      res.json({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        cpf: usuario.cpf,
        adm_mindtax: perfilADM?.adm_mindtax || false,
        user_modulos: user_modulos,
        status: usuario.status
      });
    } catch (error: any) {
      log.error(`Erro no /auth/me: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Logout: invalida a sessão limpando o cookie httpOnly
  logout: async (req: AuthRequest, res: Response) => {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });
    log.info(`Logout: userId=${req.user?.id}, email=${req.user?.email}`);
    res.status(204).send();
  }
};
