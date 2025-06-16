// __mocks__/axios.ts
const axiosMock = {
  create: () => ({
    get: jest.fn().mockResolvedValue({ data: { response: { success: true } } }),
  }),
};

export default axiosMock;
export const AxiosError = jest.fn();