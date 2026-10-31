import { convertFileSrc } from '@tauri-apps/api/core';
import { desktop } from './api';
export const mediaUrl = (path: string) => desktop ? convertFileSrc(path) : path;
