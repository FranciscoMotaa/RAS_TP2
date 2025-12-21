const express = require('express');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const router = express.Router();

// Configurações (Idealmente devem vir de variáveis de ambiente .env)
const SHARE_SECRET = process.env.SHARE_SECRET || 'segredo_super_secreto_mudar_em_prod';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Store simples em memória para tokens consumidos (single-use).
// Nota: Para produção isto deve ser persistido (Redis/DB) para suportar múltiplas instâncias
const consumedTokenIds = new Set();

// ---------------------------------------------------------
// Passo 5: Gerar Link de Partilha
// POST /api/projects/:id/share
// Body: { "permission": "view" | "edit" }
// ---------------------------------------------------------
router.post('/projects/:id/share', async (req, res) => {
    try {
        const projectId = req.params.id;
        const { permission, expiresHours, singleUse } = req.body;

        // Validação da permissão
        if (!['view', 'edit'].includes(permission)) {
            return res.status(400).json({ error: "Permissão inválida. Use 'view' ou 'edit'." });
        }

        // NOTA: Aqui deves adicionar a verificação se o utilizador (req.user) é dono do projeto

        // Gerar um JTI único para permitir marcar uso único
        const jti = randomUUID();

        // Default 7 dias (168 hours) se não for especificado
        const hours = typeof expiresHours === 'number' && expiresHours > 0 ? expiresHours : 168;
        const expiresIn = `${hours}h`;

        // Criar payload do token
        const payload = {
            projectId,
            permission,
            type: 'share_link',
            singleUse: !!singleUse,
            jti
        };

        // Gerar Token JWT
        const token = jwt.sign(payload, SHARE_SECRET, { expiresIn, jwtid: jti });

        // Construir o link final para o utilizador copiar
        const shareLink = `${FRONTEND_URL}/share/access?token=${token}`;

        res.json({
            success: true,
            link: shareLink,
            expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
            singleUse: !!singleUse
        });
    } catch (error) {
        console.error("Erro ao gerar partilha:", error);
        res.status(500).json({ error: "Erro interno ao processar partilha." });
    }
});

// ---------------------------------------------------------
// Passo 7: Validar Link (Acedido pelo Destinatário)
// GET /api/share/validate?token=...
// ---------------------------------------------------------
router.get('/share/validate', (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).json({ error: "Token em falta." });

    try {
        const decoded = jwt.verify(token, SHARE_SECRET);

        if (decoded.type !== 'share_link') {
            return res.status(403).json({ error: "Token inválido." });
        }

        // Se for single-use e já foi consumido
        if (decoded.singleUse && decoded.jti && consumedTokenIds.has(decoded.jti)) {
            return res.status(410).json({ error: "Este link de partilha já foi usado." });
        }

        // Marcar como consumido se singleUse
        if (decoded.singleUse && decoded.jti) {
            consumedTokenIds.add(decoded.jti);
        }

        // Token válido! Retorna dados para o Frontend abrir o projeto
        res.json({
            valid: true,
            projectId: decoded.projectId,
            permission: decoded.permission,
            singleUse: !!decoded.singleUse
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(410).json({ error: "Este link de partilha expirou." });
        }
        return res.status(403).json({ error: "Link de partilha inválido." });
    }
});

// Endpoint opcional para consumir explicitamente um token (marca como usado)
router.post('/share/consume', (req, res) => {
    const { token } = req.body;

    if (!token) return res.status(400).json({ error: "Token em falta." });

    try {
        const decoded = jwt.verify(token, SHARE_SECRET);

        if (decoded.type !== 'share_link') {
            return res.status(403).json({ error: "Token inválido." });
        }

        if (!decoded.singleUse) {
            return res.status(400).json({ error: "Este link não é de uso único." });
        }

        if (decoded.jti && consumedTokenIds.has(decoded.jti)) {
            return res.status(410).json({ error: "Este link de partilha já foi usado." });
        }

        if (decoded.jti) consumedTokenIds.add(decoded.jti);

        res.json({ consumed: true });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(410).json({ error: "Este link de partilha expirou." });
        }
        return res.status(403).json({ error: "Link de partilha inválido." });
    }
});

module.exports = router;
