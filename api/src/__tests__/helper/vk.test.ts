// __tests__/helpers.vk.test.ts
import {checkAuthAndroid, vkMethod} from "@/helper/vk"
import {AndroidClient, cleanupData, cleanupDataAndSortPart, sortLocalPartTracks, md5} from "@/helper/index"
import {Request, Response, NextFunction} from "express"
import {type VkPlaylistResponse, VkResponse} from "@/__genedated__/openapi/vk";
import {AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig, RawAxiosResponseHeaders} from "axios";

jest.mock("axios")

jest.mock("@/helper/index", () => {
  const original = jest.requireActual("@/helper/index")
  return {
    ...original,
    AndroidClient: {
      get: jest.fn()
    }
  }
})

describe("checkAuthAndroid", () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {
    });
    jest.spyOn(console, 'debug').mockImplementation(() => {
    });
    jest.spyOn(console, 'error').mockImplementation(() => {
    });
    jest.spyOn(console, 'info').mockImplementation(() => {
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should call next() if session is valid", async () => {
    const req = {session: {access_token: "token", user_id: "123"}, headers: {}} as unknown as Request
    const res = {status: jest.fn().mockReturnThis(), send: jest.fn()} as unknown as Response
    const next = jest.fn()

    await checkAuthAndroid(req, res, next)
    expect(next).toBeCalled()
  })

  it("should return 403 if session and x-auth-token are missing", async () => {
    const req = {session: {}, headers: {}} as unknown as Request
    const res = {status: jest.fn().mockReturnThis(), send: jest.fn()} as unknown as Response
    const next = jest.fn()

    await checkAuthAndroid(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.send).toHaveBeenCalled()
    expect(next).not.toBeCalled()
  })
})

describe("vkMethod", () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {
    });
    jest.spyOn(console, 'debug').mockImplementation(() => {
    });
    jest.spyOn(console, 'error').mockImplementation(() => {
    });
    jest.spyOn(console, 'info').mockImplementation(() => {
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should call AndroidClient and return response", async () => {
    // given
    const req = {
      session: {
        access_token: "token",
        secret: "secret",
        device_id: "abc"
      }
    } as unknown as Request

    const mockConfig: InternalAxiosRequestConfig = {
      url: '',
      method: 'get',
      transformRequest: [],
      transformResponse: [],
      timeout: 0,
      adapter: undefined,
      responseType: 'json',
      xsrfCookieName: '',
      xsrfHeaderName: '',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      transitional: {
        silentJSONParsing: true,
        forcedJSONParsing: true,
        clarifyTimeoutError: false,
      },
      headers: {} as AxiosHeaders
    };
    const mocPlaylistResponse: VkPlaylistResponse = {
      count: 1,
      items: [{id: 1, owner_id: 0, artist: "", title: "", duration: 0, url: "", date: 0}]
    };
    const mockResponse: AxiosResponse<VkResponse, any> = {
      data: {response: {...mocPlaylistResponse}},
      status: 0,
      statusText: "",
      headers: {} as AxiosHeaders,
      config: mockConfig
    };
    // when
    (AndroidClient.get as jest.Mock).mockResolvedValueOnce(mockResponse)

    const result = await vkMethod(req, "audio.get", {count: 1})
    // then
    expect(AndroidClient.get).toBeCalled()
    expect(result.response).toEqual({
      count: 1,
      items: [{id: 1, owner_id: 0, artist: "", title: "", duration: 0, url: "", date: 0}]
    })
  })

  it("should throw error if AndroidClient fails", async () => {
    const req = {
      session: {access_token: "token", secret: "secret", device_id: "abc"}
    } as unknown as Request

    const error = {error_msg: "Bad token"};
    (AndroidClient.get as jest.Mock).mockRejectedValueOnce(error)

    await expect(vkMethod(req, "audio.get", {count: 1})).rejects.toThrow("Bad token")
  })
})

describe("md5", () => {
  it("should hash input string", () => {
    expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72")
  })
})

describe("cleanupData", () => {
  it("should clean artist and title from playlist items", () => {
    const input = {
      items: [
        {
          artist: "FRISKY | DJ",
          title: "Mix 2024 - Something [vk.com/feelin_frisky]"
        }
      ]
    }
    // @ts-ignore
    const result = cleanupData(input)
    expect(result.items[0].artist).toBe("DJ")
    expect(result.items[0].title).not.toContain("vk.com")
  })
})

describe("sortLocalPartTracks", () => {
  it("should sort parts in order", () => {
    const input = {
      items: [
        {title: "Set (Part 2)"},
        {title: "Set (Part 1)"}
      ]
    }
    // @ts-ignore
    const result = sortLocalPartTracks(input)
    expect(result.items[0].title).toBe("Set (Part 1)")
    expect(result.items[1].title).toBe("Set (Part 2)")
  })
})

describe("cleanupDataAndSortPart", () => {
  it("should clean and sort", () => {
    const input = {
      items: [
        {
          artist: "FRISKY | DJ",
          title: "Set 2024 - A (Part 2) [vk.com/feelin_frisky]"
        },
        {
          artist: "FRISKY | DJ",
          title: "Set 2024 - A (Part 1) [vk.com/feelin_frisky]"
        }
      ]
    }
    // @ts-ignore
    const result = cleanupDataAndSortPart(input)
    expect(result.items[0].title).toContain("Part 1")
    expect(result.items[1].title).toContain("Part 2")
  })
})