"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadA2uiMockJson = loadA2uiMockJson;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * 从 monorepo `packages/a2ui-core/mock/<name>.json` 读取合并 A2UI 消息。
 * 运行时 cwd 可为任意目录，故以本文件位置解析路径。
 */
function loadA2uiMockJson(mockBaseName) {
    const mockDir = path_1.default.resolve(__dirname, '../../../packages/a2ui-core/mock');
    const file = path_1.default.join(mockDir, `${mockBaseName}.json`);
    const raw = fs_1.default.readFileSync(file, 'utf8');
    return JSON.parse(raw);
}
//# sourceMappingURL=loadA2uiMock.js.map