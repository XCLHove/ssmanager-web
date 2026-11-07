import { Router } from 'express';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import {
  TemplateError,
  getTemplate,
  previewTemplate,
  saveTemplate,
} from '../services/templateService.js';

const router = Router();

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

// POST /api/admin/templates/get {port}
router.post('/get', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const port = parsePort(req.body?.port);
  if (port === null) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }
  try {
    return okEncrypted(res, req.session, getTemplate(port));
  } catch (err) {
    if (err instanceof TemplateError) {
      return fail(res, 400, err.message);
    }
    throw err;
  }
});

// POST /api/admin/templates/save {port, format, code}
router.post('/save', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const port = parsePort(req.body?.port);
  if (port === null) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }
  const format = typeof req.body?.format === 'string' ? req.body.format : 'clash';
  const code = req.body?.code;

  try {
    saveTemplate(port, format, code);
    return okEncrypted(res, req.session, { ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return fail(res, 400, err.message);
    }
    throw err;
  }
});

// POST /api/admin/templates/preview {port, code}
router.post('/preview', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const port = parsePort(req.body?.port);
  if (port === null) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }
  const code = req.body?.code;

  try {
    const yaml = previewTemplate(port, code);
    return okEncrypted(res, req.session, { yaml });
  } catch (err) {
    if (err instanceof TemplateError) {
      return fail(res, 400, err.message);
    }
    throw err;
  }
});

export default router;
