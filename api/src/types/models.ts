/** 共享业务类型（仅类型层，不改变运行逻辑）。 */

export interface ServerUser {
  name: string;
  password: string;
  username?: string;
}

export interface ManagedServer {
  port: number;
  password?: string;
  method?: string;
  noDelay?: boolean;
  plugin?: string;
  pluginOpts?: string;
  pluginMode?: string;
  mode?: string;
  users?: ServerUser[];
}

export interface ServerOptions {
  method?: string;
  noDelay?: boolean;
  plugin?: string;
  pluginOpts?: string;
  pluginMode?: string;
  mode?: string;
}

export interface ServerRecord extends ServerOptions {
  port: number;
  password: string | null;
  templateCode: string | null;
  templateFormat: string;
  templateUpdatedAt: number | null;
}

export interface Account {
  userId: number | null;
  username: string;
  role: string;
}
