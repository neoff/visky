import {PlaylistResponse, TokenResponse, UserInfoResponse, VkResponse} from "@/types/response/vk";

/**
 * Моковые (тестовые) данные для PlaylistResponse
 */
const mockPlaylistResponse: PlaylistResponse = {
  count: 2,
  items: [
    {
      id: 1,
      owner_id: 100,
      artist: 'Test Artist 1',
      title: 'Test Title 1',
      duration: 180,
      url: 'http://example.com/1.mp3',
      date: 1678886400,
      is_licensed: true,
    },
    {
      id: 2,
      owner_id: 101,
      artist: 'Test Artist 2',
      title: 'Test Title 2',
      duration: 240,
      url: 'http://example.com/2.mp3',
      date: 1678886500,
    },
  ],
};

/**
 * Моковые данные для UserInfoResponse
 */
const mockUserInfoResponse: UserInfoResponse = {
  profile: {
    id: 12345,
    first_name: 'John',
    last_name: 'Doe',
    is_closed: false,
    can_access_closed: true,
  },
  info: {
    country: 'RU',
    email: 'john.doe@example.com',
    '2fa_required': 1,
  },
  time: 1678886600,
};

/**
 * Моковые данные для TokenResponse
 */
const mockTokenResponse: TokenResponse = {
  token: 'a1b2c3d4e5f6g7h8i9j0',
  secret: 's3cr3t_k3y_h3r3',
};

/**
 * Тестовый набор для проверки объекта VkResponse
 */
describe('VkResponse Handling', () => {

  // Тест для случая, когда response содержит PlaylistResponse
  test('should handle VkResponse with PlaylistResponse correctly', () => {
    const vkResponse: VkResponse = {
      response: mockPlaylistResponse,
    };

    // Проверяем, что вложенный объект является PlaylistResponse
    expect(vkResponse.response).toBeDefined();
    // Используем type guard, чтобы убедиться в типе и его свойствах
    if ('items' in vkResponse.response!) {
      expect(vkResponse.response.count).toBe(2);
      expect(vkResponse.response.items).toHaveLength(2);
      expect(vkResponse.response.items[0].artist).toBe('Test Artist 1');
    }
  });

  // Тест для случая, когда response содержит UserInfoResponse
  test('should handle VkResponse with UserInfoResponse correctly', () => {
    const vkResponse: VkResponse = {
      response: mockUserInfoResponse,
    };

    // Проверяем, что вложенный объект является UserInfoResponse
    expect(vkResponse.response).toBeDefined();
    if ('profile' in vkResponse.response!) {
      expect(vkResponse.response.profile?.first_name).toBe('John');
      expect(vkResponse.response.info?.country).toBe('RU');
    }
  });

  // Тест для случая, когда response содержит TokenResponse
  test('should handle VkResponse with TokenResponse correctly', () => {
    const vkResponse: VkResponse = {
      response: mockTokenResponse,
    };

    // Проверяем, что вложенный объект является TokenResponse
    expect(vkResponse.response).toBeDefined();
    if ('token' in vkResponse.response!) {
      expect(vkResponse.response.token).toBe('a1b2c3d4e5f6g7h8i9j0');
      expect(vkResponse.response.secret).toBe('s3cr3t_k3y_h3r3');
    }
  });

  // Тест для случая, когда response отсутствует
  test('should handle VkResponse with empty or undefined response', () => {
    const vkResponse: VkResponse = {};
    expect(vkResponse.response).toBeUndefined();

    const vkResponseNull: VkResponse = { response: undefined };
    expect(vkResponseNull.response).toBeUndefined();
  });
});