// __mocks__/axios.ts
//
// `create` records the config it was handed. The frisky client encodes its own
// query parameters, and getting that wrong fails SILENTLY — frisky answers a
// `+`-encoded space with empty arrays, not an error — so the config itself is
// worth asserting on.
const created: any[] = [];

const axiosMock = {
  create: (config?: any) => {
    created.push(config ?? {});
    return {
      get: jest.fn().mockResolvedValue({ data: { response: { success: true } } }),
    };
  },
  /** every config `create` was called with, newest last */
  __created: created,
  __resetCreated: () => created.splice(0, created.length),
};

export default axiosMock;
export const AxiosError = jest.fn();
