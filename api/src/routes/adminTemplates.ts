import { Router } from 'express';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import {
  TemplateError,
  getTemplate,
  previewTemplate,
  saveTemplate,
  validateTemplateCode,
} from '../services/templateService.js';
import {
  createTemplateLibraryItem,
  deleteTemplateLibraryItem,
  findTemplateLibraryByName,
  getTemplateLibraryItem,
  listTemplateLibrary,
  updateTemplateLibraryItem,
} from '../stores/templateLibraryStore.js';

const router = Router();

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 100 ? name : null;
}

function parseLibraryFormat(value) {
  return value === undefined || value === '' ? 'clash' : value === 'clash' ? 'clash' : null;
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

// ---- 模板库 CRUD ----

// POST /api/admin/templates/library/list
router.post('/library/list', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  return okEncrypted(res, req.session, { items: listTemplateLibrary() });
});

// POST /api/admin/templates/library/get {id}
router.post('/library/get', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const id = parseId(req.body?.id);
  if (id === null) {
    return fail(res, 400, '模板 ID 无效');
  }
  const item = getTemplateLibraryItem(id);
  if (!item) {
    return fail(res, 400, '模板不存在');
  }
  return okEncrypted(res, req.session, item);
});

// POST /api/admin/templates/library/create {name, format?, code}
router.post('/library/create', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const name = parseName(req.body?.name);
  const format = parseLibraryFormat(req.body?.format);
  const code = req.body?.code;

  if (!name) {
    return fail(res, 400, '模板名称不能为空（最多 100 字符）');
  }
  if (format === null) {
    return fail(res, 400, '仅支持 clash 格式');
  }
  if (findTemplateLibraryByName(name)) {
    return fail(res, 400, '模板名称已存在');
  }

  try {
    validateTemplateCode(code);
    const id = createTemplateLibraryItem(name, format, code);
    return okEncrypted(res, req.session, { id });
  } catch (err) {
    if (err instanceof TemplateError) {
      return fail(res, 400, err.message);
    }
    throw err;
  }
});

// POST /api/admin/templates/library/update {id, name, format?, code}
router.post('/library/update', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const id = parseId(req.body?.id);
  const name = parseName(req.body?.name);
  const format = parseLibraryFormat(req.body?.format);
  const code = req.body?.code;

  if (id === null) {
    return fail(res, 400, '模板 ID 无效');
  }
  const existing = getTemplateLibraryItem(id);
  if (!existing) {
    return fail(res, 400, '模板不存在');
  }
  if (!name) {
    return fail(res, 400, '模板名称不能为空（最多 100 字符）');
  }
  if (format === null) {
    return fail(res, 400, '仅支持 clash 格式');
  }
  const sameName = findTemplateLibraryByName(name);
  if (sameName && sameName.id !== id) {
    return fail(res, 400, '模板名称已存在');
  }

  try {
    validateTemplateCode(code);
    updateTemplateLibraryItem(id, name, format, code);
    return okEncrypted(res, req.session, { ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return fail(res, 400, err.message);
    }
    throw err;
  }
});

// POST /api/admin/templates/library/remove {id}
router.post('/library/remove', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const id = parseId(req.body?.id);
  if (id === null) {
    return fail(res, 400, '模板 ID 无效');
  }
  if (!deleteTemplateLibraryItem(id)) {
    return fail(res, 400, '模板不存在');
  }
  return okEncrypted(res, req.session, { ok: true });
});

export default router;
