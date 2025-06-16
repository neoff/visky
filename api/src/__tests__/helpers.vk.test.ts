// __tests__/helpers.vk.test.ts
import { checkAuthAndroid, method } from "@/helpers/vk"
import { AndroidClient, cleanupData, cleanupDataAndSortPart, sortLocalPartTracks, md5 } from "@/helpers/index"
import { Request, Response, NextFunction } from "express"

jest.mock("axios")

jest.mock("@/helpers/index", () => {
  const original = jest.requireActual("@/helpers/index")
  return {
    ...original,
    AndroidClient: {
      get: jest.fn()
    }
  }
})

describe("checkAuthAndroid", () => {
  it("should call next() if session is valid", async () => {
    const req = { session: { access_token: "token", user_id: "123" }, headers: {} } as unknown as Request
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as Response
    const next = jest.fn()

    await checkAuthAndroid(req, res, next)
    expect(next).toBeCalled()
  })

  it("should return 403 if session and x-auth-token are missing", async () => {
    const req = { session: {}, headers: {} } as unknown as Request
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as Response
    const next = jest.fn()

    await checkAuthAndroid(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.send).toHaveBeenCalled()
    expect(next).not.toBeCalled()
  })
})

describe("method", () => {
  it("should call AndroidClient and return response", async () => {
    const req = {
      session: {
        access_token: "token",
        secret: "secret",
        device_id: "abc"
      }
    } as unknown as Request

    const mockResponse = { data: { response: { test: "ok" } } }
    ;(AndroidClient.get as jest.Mock).mockResolvedValueOnce(mockResponse)

    const result = await method(req, "audio.get", { count: 1 })
    expect(AndroidClient.get).toBeCalled()
    expect(result).toEqual({ test: "ok" })
  })

  it("should throw error if AndroidClient fails", async () => {
    const req = {
      session: { access_token: "token", secret: "secret", device_id: "abc" }
    } as unknown as Request

    const error = { error_msg: "Bad token" }
    ;(AndroidClient.get as jest.Mock).mockRejectedValueOnce(error)

    await expect(method(req, "audio.get", { count: 1 })).rejects.toThrow("Bad token")
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
        { title: "Set (Part 2)" },
        { title: "Set (Part 1)" }
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