import Module from 'module';

// Mock server-only to prevent it from throwing errors when run via tsx/CLI
const originalRequire = Module.prototype.require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module.prototype.require = function (id: string) {
    if (id === 'server-only') {
        return {};
    }
    return originalRequire.apply(this, arguments as any);
};
