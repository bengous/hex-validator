import { entityPatternsPlugin } from '@validator/plugins/rules/entity-patterns';
import type { PluginContext } from '@validator/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ts-morph Project and classes
const mockGetClasses = vi.fn<any>(() => []);

vi.mock('ts-morph', () => ({
  Project: class MockProject {
    getSourceFiles() {
      return [
        {
          getFilePath: () => '/project/src/modules/auth/core/domain/User.ts',
          getClasses: mockGetClasses,
          getLineAndColumnAtPos: () => ({ line: 1, column: 1 }),
        },
      ];
    }
  },
  Scope: {
    Public: 0,
    Protected: 1,
    Private: 2,
  },
}));

function createContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    cwd: '/project',
    ci: false,
    scope: 'full',
    changedFiles: [],
    stagedFiles: [],
    env: process.env,
    config: { stages: [] },
    ...overrides,
  };
}

describe('entityPatternsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClasses.mockReset();
  });

  describe('Rule 9: Private Constructor', () => {
    it('detects public constructor in entity', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 0, // Public
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'error',
        code: 'entity/private-constructor',
        message: expect.stringContaining("Entity 'User' must have private constructor"),
        suggestion: expect.stringContaining('Make constructor private'),
      });
    });

    it('accepts private constructor', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2, // Private
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('accepts protected constructor', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 1, // Protected
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Rule 10: create() Returns Result<T>', () => {
    it('detects create() not returning Result', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2, // Private
              getStart: () => 100,
            },
          ],
          getStaticMethod: (name: string) => {
            if (name === 'create') {
              return {
                getReturnType: () => ({
                  getText: () => 'User',
                }),
                getStart: () => 200,
              };
            }
            return null;
          },
          getMethods: () => [],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.[0]).toMatchObject({
        level: 'error',
        code: 'entity/create-returns-result',
        message: expect.stringContaining('must return Result<T>'),
        suggestion: expect.stringContaining('Result<User, string>'),
      });
    });

    it('accepts create() returning Result<T>', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2, // Private
              getStart: () => 100,
            },
          ],
          getStaticMethod: (name: string) => {
            if (name === 'create') {
              return {
                getReturnType: () => ({
                  getText: () => 'Result<User, string>',
                }),
                getStart: () => 200,
              };
            }
            return null;
          },
          getMethods: () => [],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('skips classes without create() method', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'ValueObject',
          getConstructors: () => [
            {
              getScope: () => 2, // Private
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Rule 11: Mutation Methods Return Result<void>', () => {
    it('warns about mutation method not returning Result', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2, // Private
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [
            {
              getName: () => 'updateEmail',
              isStatic: () => false,
              getReturnType: () => ({
                getText: () => 'void',
              }),
              getStart: () => 300,
            },
          ],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('warn');
      expect(result.messages?.[0]).toMatchObject({
        level: 'warn',
        code: 'entity/mutation-returns-result',
        message: expect.stringContaining(
          "Mutation method 'updateEmail()' should return Result<void>"
        ),
        suggestion: expect.stringContaining('propagate validation errors'),
      });
    });

    it('accepts mutation method returning Result<void>', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2, // Private
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [
            {
              getName: () => 'updateEmail',
              isStatic: () => false,
              getReturnType: () => ({
                getText: () => 'Result<void, string>',
              }),
              getStart: () => 300,
            },
          ],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('checks various mutation method prefixes', async () => {
      const mutationPrefixes = [
        'set',
        'update',
        'add',
        'remove',
        'delete',
        'change',
        'modify',
        'assign',
        'mark',
      ];

      for (const prefix of mutationPrefixes) {
        mockGetClasses.mockReturnValue([
          {
            getName: () => 'User',
            getConstructors: () => [
              {
                getScope: () => 2,
                getStart: () => 100,
              },
            ],
            getStaticMethod: () => null,
            getMethods: () => [
              {
                getName: () => `${prefix}Field`,
                isStatic: () => false,
                getReturnType: () => ({
                  getText: () => 'void',
                }),
                getStart: () => 300,
              },
            ],
          },
        ]);

        const result = await entityPatternsPlugin.run(createContext());

        expect(result.status).toBe('warn');
        expect(result.messages?.[0]?.message).toContain(`${prefix}Field`);
      }
    });

    it('skips static methods', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2,
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [
            {
              getName: () => 'updateGlobalConfig',
              isStatic: () => true, // Static method
              getReturnType: () => ({
                getText: () => 'void',
              }),
              getStart: () => 300,
            },
          ],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('skips non-mutation methods', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 2,
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [
            {
              getName: () => 'getEmail',
              isStatic: () => false,
              getReturnType: () => ({
                getText: () => 'string',
              }),
              getStart: () => 300,
            },
          ],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Scope filtering', () => {
    it('skips when no domain files changed', async () => {
      const ctx = createContext({
        scope: 'staged',
        changedFiles: ['src/app/page.tsx'],
      });

      const result = await entityPatternsPlugin.run(ctx);

      expect(result.status).toBe('skipped');
    });

    it('runs when domain files changed', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 0, // Public
              getStart: () => 100,
            },
          ],
          getStaticMethod: () => null,
          getMethods: () => [],
        },
      ]);

      const ctx = createContext({
        scope: 'staged',
        stagedFiles: ['src/modules/auth/core/domain/User.ts'],
      });

      const result = await entityPatternsPlugin.run(ctx);

      expect(result.status).toBe('fail');
      expect(result.messages?.[0]?.code).toBe('entity/private-constructor');
    });
  });

  describe('Multiple violations', () => {
    it('reports all violations in single entity', async () => {
      mockGetClasses.mockReturnValue([
        {
          getName: () => 'User',
          getConstructors: () => [
            {
              getScope: () => 0, // Public - violation 1
              getStart: () => 100,
            },
          ],
          getStaticMethod: (name: string) => {
            if (name === 'create') {
              return {
                getReturnType: () => ({
                  getText: () => 'User', // Not Result - violation 2
                }),
                getStart: () => 200,
              };
            }
            return null;
          },
          getMethods: () => [
            {
              getName: () => 'updateEmail',
              isStatic: () => false,
              getReturnType: () => ({
                getText: () => 'void', // Not Result - violation 3
              }),
              getStart: () => 300,
            },
          ],
        },
      ]);

      const result = await entityPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(3);
      const codes = result.messages?.map((m) => m.code);
      expect(codes).toContain('entity/private-constructor');
      expect(codes).toContain('entity/create-returns-result');
      expect(codes).toContain('entity/mutation-returns-result');
    });
  });
});
