/**
 * shadowsocks-rust ssmanager 协议客户端（UDP 或 Unix datagram socket）
 *
 * 协议（shadowsocks-rust crates/shadowsocks/src/manager/protocol.rs 与
 * crates/shadowsocks-service/src/manager/server.rs，README「Server Manager」章节）：
 *   add    → `add: {"server_port":8388,"password":"...", ...可选字段}`   响应 `ok`（失败为错误文本）
 *            可选字段：method、no_delay、plugin、plugin_opts、plugin_mode、mode、
 *            users（[{name, password}]）；未提供的字段不出现在 JSON 中
 *   remove → `remove: {"server_port":8388}`                 响应 `ok`
 *   list   → `list`                                         响应 JSON 数组
 *             `[{"server_port":8388,"password":"..."}]`
 *             注：ssmanager 1.25.0 的 list 只回填 server_port/password/users，
 *             method/no_delay/plugin/plugin_opts/plugin_mode/mode 恒为 None（被省略）。
 *   ping   → `ping`                                         响应 `stat: {"8388":12345}`
 *             （端口 → 累计收发字节数；ssmanager 的 stat 推送在 builtin 模式下不支持，
 *              ping 即是唯一的流量查询方式）
 *
 * 命令以 `\n` 结尾；响应同样以 `\n` 结尾，解析前需 trim。
 */

import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { config, managerAddressString } from './config.js';
import type { ManagedServer, ServerOptions, ServerUser } from './types/models.js';

const require = createRequire(import.meta.url);

/** unix-dgram 为可选依赖，按需加载（未安装/平台不支持时给出清晰错误） */
let unixDgramModule: any = null;
function loadUnixDgram(): any {
  if (unixDgramModule) return unixDgramModule;
  try {
    unixDgramModule = require('unix-dgram');
  } catch {
    throw new ManagerError(
      '当前环境无法加载 unix-dgram，Unix socket 模式需要安装 unix-dgram（仅支持 Unix 系统）'
    );
  }
  return unixDgramModule;
}

/** 与 ssmanager 通信相关的错误，HTTP 层应映射为 502 */
export class ManagerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManagerError';
  }
}

function sanitizeResponseText(text: string): string {
  // 仅用于错误信息：去掉控制字符、压缩空白并限制长度，避免把原始 UDP 报文直接抛给前端
  return String(text)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** 按配置的协议分发命令 */
function sendCommand(payload: string): Promise<string> {
  return config.managerProtocol === 'unix'
    ? sendUnixCommand(payload)
    : sendUdpCommand(payload);
}

/**
 * UDP：发送一条命令并等待第一条响应报文。
 * 每次请求使用独立的临时 socket（绑定随机端口并 connect 到 ssmanager），
 * 请求之间互不干扰，超时后自动关闭。
 */
function sendUdpCommand(payload: string): Promise<string> {
  const { managerTimeoutMs } = config;
  const managerAddress = config.managerAddress as string;
  const managerPort = config.managerPort as number;

  return new Promise<string>((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;

    const finish = (fn: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(
        reject,
        new ManagerError(
          `ssmanager (${managerAddressString()}) 在 ${managerTimeoutMs}ms 内没有响应`
        )
      );
    }, managerTimeoutMs);

    socket.on('error', (err) => {
      finish(reject, new ManagerError(`ssmanager (${managerAddressString()}) 通信失败: ${err.message}`));
    });

    socket.on('message', (msg) => {
      // 保留完整响应（list 可能较长，多用户/额外字段会使其远超 200 字符），仅 trim 掉结尾换行
      finish(resolve, msg.toString('utf8').trim());
    });

    socket.bind(() => {
      socket.connect(managerPort, managerAddress, () => {
        socket.send(Buffer.from(payload, 'utf8'), (err) => {
          if (err) {
            finish(reject, new ManagerError(`ssmanager (${managerAddressString()}) 发送命令失败: ${err.message}`));
          }
        });
      });
    });
  });
}

/**
 * Unix datagram：ssmanager 通过 UnixDatagram 的 send_to(peer path) 回包，
 * 因此客户端必须先 bind 一个本地临时 socket 路径。
 * unix-dgram 为可选依赖，仅在 Unix 系统、Unix 模式实际发请求时懒加载。
 */
function sendUnixCommand(payload: string): Promise<string> {
  if (process.platform === 'win32') {
    return Promise.reject(
      new ManagerError(
        '当前系统为 Windows，不支持 Unix socket 模式（ssmanagerAddress 请使用 host:port）'
      )
    );
  }

  let unixDgram;
  try {
    unixDgram = loadUnixDgram();
  } catch (err) {
    return Promise.reject(err);
  }

  const socketPath = config.managerSocketPath as string;
  const timeoutMs = config.managerTimeoutMs;
  const clientPath = path.join(
    os.tmpdir(),
    `ssmanager-web-${process.pid}-${crypto.randomBytes(4).toString('hex')}.sock`
  );
  const buffer = Buffer.from(payload, 'utf8');

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let socket: any = null;
    let timer: NodeJS.Timeout | null = null;

    const finish = (fn: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (socket) {
        try {
          socket.close();
        } catch {
          // 忽略关闭时的异常，避免掩盖原始错误
        }
      }
      try {
        fs.unlinkSync(clientPath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('[managerClient] 清理临时 Unix socket 失败:', err.message);
        }
      }
      fn(value);
    };

    try {
      socket = unixDgram.createSocket('unix_dgram');
      socket.on('error', (err) => {
        finish(reject, new ManagerError(`ssmanager (${managerAddressString()}) 通信失败: ${err.message}`));
      });
      socket.on('message', (msg) => {
        finish(resolve, msg.toString('utf8').trim());
      });

      timer = setTimeout(() => {
        finish(
          reject,
          new ManagerError(`ssmanager (${managerAddressString()}) 在 ${timeoutMs}ms 内没有响应`)
        );
      }, timeoutMs);

      socket.bind(clientPath);
      socket.send_to(buffer, 0, buffer.length, socketPath);
    } catch (err) {
      finish(reject, new ManagerError(`ssmanager (${managerAddressString()}) 通信失败: ${err.message}`));
    }
  });
}

/** `add` / `remove` 的响应是纯文本：`ok` 表示成功，其余内容为错误说明 */
function assertOk(response: string, actionLabel: string): void {
  if (response !== 'ok') {
    const detail = sanitizeResponseText(response) || '空响应';
    throw new ManagerError(`${actionLabel}失败: ${detail}`);
  }
}

/** 把 list 返回的 snake_case ServerConfig 映射为对外 camelCase；未设置的字段不输出 */
function toCamelServer(config: any): ManagedServer {
  const server: ManagedServer = { port: Number(config.server_port) };
  if (typeof config.password === 'string') server.password = config.password;
  if (typeof config.method === 'string') server.method = config.method;
  if (typeof config.no_delay === 'boolean') server.noDelay = config.no_delay;
  if (typeof config.plugin === 'string') server.plugin = config.plugin;
  if (typeof config.plugin_opts === 'string') server.pluginOpts = config.plugin_opts;
  if (typeof config.plugin_mode === 'string') server.pluginMode = config.plugin_mode;
  if (typeof config.mode === 'string') server.mode = config.mode;
  if (Array.isArray(config.users) && config.users.length > 0) {
    server.users = config.users.map((user) => ({
      name: user.name,
      password: user.password,
    }));
  }
  return server;
}

export const managerClient = {
  /**
   * 添加一个服务端口。options 中的可选字段按 CamelCase → snake_case 映射后
   * 仅在已提供时写入 add 载荷；成功（ssmanager 返回 ok）后通过 `list` 复核端口确实在运行，
   * 因为 ssmanager 在端口绑定失败等情况下仍会回复 ok（仅记录日志）。
   */
  async addServer(
    port: number,
    password: string,
    options: ServerOptions & { users?: ServerUser[] } = {}
  ): Promise<void> {
    const payload: any = { server_port: port, password };
    const { method, noDelay, plugin, pluginOpts, pluginMode, mode, users } = options;

    if (method) payload.method = method;
    if (typeof noDelay === 'boolean') payload.no_delay = noDelay;
    if (plugin) payload.plugin = plugin;
    if (pluginOpts) payload.plugin_opts = pluginOpts;
    if (pluginMode) payload.plugin_mode = pluginMode;
    if (mode) payload.mode = mode;
    if (Array.isArray(users) && users.length > 0) {
      payload.users = users.map(({ name, password: userPassword }) => ({
        name,
        password: userPassword,
      }));
    }

    const command = `add: ${JSON.stringify(payload)}\n`;
    const response = await sendCommand(command);
    assertOk(response, '添加端口');

    const ports = await this.listPorts();
    if (!ports.includes(port)) {
      throw new ManagerError(
        `ssmanager 已接受命令，但端口 ${port} 未出现在运行列表中（可能端口被占用或启动失败）`
      );
    }
  },

  /** 移除一个服务端口（端口不存在时 ssmanager 也返回 ok） */
  async removeServer(port: number): Promise<void> {
    const command = `remove: ${JSON.stringify({ server_port: port })}\n`;
    const response = await sendCommand(command);
    assertOk(response, '移除端口');
  },

  /**
   * `list` 响应是纯 JSON 数组（无命令前缀）：
   *   [{"server_port":8388,"password":"...","users":[...]}]
   * 返回按端口升序、已映射为 camelCase 的服务器列表。
   * 注意：受 ssmanager 1.25.0 限制，实际只会带回 port/password/users。
   */
  async listServers(): Promise<ManagedServer[]> {
    const response = await sendCommand('list\n');
    let parsed: any;
    try {
      parsed = JSON.parse(response);
    } catch {
      throw new ManagerError('ssmanager 的 list 响应不是合法 JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new ManagerError('ssmanager 的 list 响应格式不符合预期');
    }
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map(toCamelServer)
      .filter((server) => Number.isInteger(server.port) && server.port >= 1 && server.port <= 65535)
      .sort((a, b) => a.port - b.port);
  },

  /** 端口列表（升序），基于 listServers，复用同一次 list 响应 */
  async listPorts(): Promise<number[]> {
    const servers = await this.listServers();
    return servers.map((server) => server.port);
  },

  /**
   * `ping` 响应格式为 `stat: {"8388":12345}`（端口 → 累计收发字节数）。
   * 兼容处理：直接返回裸 JSON 映射也能解析。
   * 返回 { [port]: bytes }。
   */
  async pingStats(): Promise<Record<number, number>> {
    const response = await sendCommand('ping\n');
    let body: any = response;
    if (/^stat\s*:/i.test(body)) {
      body = body.replace(/^stat\s*:\s*/i, '');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ManagerError('ssmanager 的 ping 响应不是合法 JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ManagerError('ssmanager 的 ping 响应格式不符合预期');
    }
    const stats: Record<number, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const port = Number(key);
      const bytes = Number(value);
      if (Number.isInteger(port) && port >= 1 && port <= 65535 && Number.isFinite(bytes) && bytes >= 0) {
        stats[port] = bytes;
      }
    }
    return stats;
  },
};
