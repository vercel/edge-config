import { trace } from './tracing';
import { clone } from './index';

/**
 * Adds swr behavior to any async function.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- any necessary for generics */
export const swr = trace(
  function swr<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    const staleValuePromiseMap = new Map<string, Promise<unknown>>();

    return (async (...args: any[]) => {
      const argsKey = JSON.stringify(args);
      const staleValuePromise = staleValuePromiseMap.get(argsKey);

      if (staleValuePromise) {
        // clone to avoid referential equality of the returned value,
        // which would unlock mutations
        void fn(...args).then(
          (result) => {
            // Only update if the map wasn't updated otherwise (due to a newer call)
            if (staleValuePromiseMap.get(argsKey) === staleValuePromise) {
              staleValuePromiseMap.set(argsKey, Promise.resolve(result));
            }
          },
          () => void 0,
        );
        return staleValuePromise.then(clone);
      }

      const resultPromise = fn(...args);
      staleValuePromiseMap.set(argsKey, resultPromise);
      resultPromise.catch((e) => {
        staleValuePromiseMap.delete(argsKey);
        throw e;
      });

      return resultPromise.then(clone);
    }) as T;
  },
  { name: 'swr' },
);
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- reenabling the rule */
