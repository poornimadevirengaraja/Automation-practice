import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const API_BASE_URL = 'https://api.restful-api.dev';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

class PublicApiPage {
  constructor(private readonly request: APIRequestContext) {}

  listObjects(ids?: string[]) {
    const query = new URLSearchParams();
    ids?.forEach((id) => query.append('id', id));
    const queryString = query.toString();
    return this.request.get(`${API_BASE_URL}/objects${queryString ? `?${queryString}` : ''}`);
  }

  getObject(id: string) {
    return this.request.get(`${API_BASE_URL}/objects/${encodeURIComponent(id)}`);
  }

  createObject(payload: JsonValue) {
    return this.request.post(`${API_BASE_URL}/objects`, {
      headers: { 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  replaceObject(id: string, payload: JsonValue) {
    return this.request.put(`${API_BASE_URL}/objects/${encodeURIComponent(id)}`, {
      headers: { 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  patchObject(id: string, payload: JsonValue) {
    return this.request.patch(`${API_BASE_URL}/objects/${encodeURIComponent(id)}`, {
      headers: { 'Content-Type': 'application/json' },
      data: payload,
    });
  }

  deleteObject(id: string) {
    return this.request.delete(`${API_BASE_URL}/objects/${encodeURIComponent(id)}`);
  }

  async cleanup(id: string) {
    const response = await this.deleteObject(id);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`Cleanup failed for object ${id}: HTTP ${response.status()}`);
    }
  }
}

function uniqueValue(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

test.describe('Public REST API', () => {
  test('covers public object retrieval, CRUD, validation, HTTPS, and CORS', async ({ request, page }) => {
    const api = new PublicApiPage(request);

    // 1. List the public sample objects over HTTPS and validate their documented shape.
    expect(new URL(API_BASE_URL).protocol).toBe('https:');
    const listResponse = await api.listObjects();
    expect(listResponse.status()).toBe(200);
    const objects = await listResponse.json();
    expect(Array.isArray(objects)).toBe(true);
    expect(objects.length).toBeGreaterThan(0);
    for (const object of objects) {
      expect(object).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String) }));
      expect(Object.prototype.hasOwnProperty.call(object, 'data')).toBe(true);
      expect(object.data === null || typeof object.data === 'object').toBe(true);
    }
    expect(objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '1', name: 'Google Pixel 6 Pro' }),
      expect.objectContaining({ id: '7', name: 'Apple MacBook Pro 16' }),
    ]));

    // 2. Filter the list by one ID and repeated ID parameters.
    const oneObjectResponse = await api.listObjects(['7']);
    expect(oneObjectResponse.status()).toBe(200);
    expect((await oneObjectResponse.json()).map((object: { id: string }) => object.id)).toEqual(['7']);

    const severalObjectsResponse = await api.listObjects(['3', '5', '10']);
    expect(severalObjectsResponse.status()).toBe(200);
    const filteredObjects = await severalObjectsResponse.json();
    expect(filteredObjects.map((object: { id: string }) => object.id)).toEqual(
      expect.arrayContaining(['3', '5', '10']),
    );
    expect(filteredObjects).toHaveLength(3);

    // 3. Retrieve the documented sample object and verify an unknown ID is not found.
    const sampleResponse = await api.getObject('7');
    expect(sampleResponse.status()).toBe(200);
    expect(await sampleResponse.json()).toEqual(expect.objectContaining({
      id: '7',
      name: 'Apple MacBook Pro 16',
      data: expect.objectContaining({
        year: 2019,
        price: 1849.99,
        'CPU model': 'Intel Core i9',
        'Hard disk size': '1 TB',
      }),
    }));

    const unknownId = uniqueValue('missing');
    const unknownResponse = await api.getObject(unknownId);
    expect(unknownResponse.status()).toBe(404);
    expect(await unknownResponse.json()).toHaveProperty('error');

    // 4. Verify an unknown ID filter returns no objects.
    const emptyFilterResponse = await api.listObjects([unknownId]);
    expect(emptyFilterResponse.status()).toBe(200);
    expect(await emptyFilterResponse.json()).toEqual([]);

    // 5. Reject malformed JSON without creating an object.
    const malformedResponse = await request.post(`${API_BASE_URL}/objects`, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"name":',
    });
    expect(malformedResponse.status()).toBe(400);
    expect(await malformedResponse.json()).toHaveProperty('error');

    // 6. Create, read, fully replace, partially update, and delete a nested-data fixture.
    const nestedPayload = {
      name: uniqueValue('api-automation'),
      data: {
        number: 42,
        enabled: true,
        tags: ['alpha', 7],
        nested: { verified: true },
      },
    };
    let nestedId: string | undefined;
    try {
      const createResponse = await api.createObject(nestedPayload);
      expect(createResponse.status()).toBe(200);
      const created = await createResponse.json();
      nestedId = created.id;
      expect(typeof nestedId).toBe('string');
      expect(created).toEqual(expect.objectContaining({
        id: nestedId,
        name: nestedPayload.name,
        data: nestedPayload.data,
      }));
      expect(created).toHaveProperty('createdAt');

      const persistedResponse = await api.getObject(nestedId!);
      expect(persistedResponse.status()).toBe(200);
      expect(await persistedResponse.json()).toEqual(expect.objectContaining(nestedPayload));

      const replacement = { name: uniqueValue('api-put'), data: { replacement: true, count: 2 } };
      const putResponse = await api.replaceObject(nestedId!, replacement);
      expect(putResponse.status()).toBe(200);
      expect(await putResponse.json()).toEqual(expect.objectContaining({
        id: nestedId,
        name: replacement.name,
        data: replacement.data,
        updatedAt: expect.anything(),
      }));
      const afterPutResponse = await api.getObject(nestedId!);
      expect(afterPutResponse.status()).toBe(200);
      expect(await afterPutResponse.json()).toEqual(expect.objectContaining(replacement));

      const patchedName = uniqueValue('api-patch');
      const patchResponse = await api.patchObject(nestedId!, { name: patchedName });
      expect(patchResponse.status()).toBe(200);
      expect(await patchResponse.json()).toEqual(expect.objectContaining({
        id: nestedId,
        name: patchedName,
        data: replacement.data,
        updatedAt: expect.anything(),
      }));
      const afterPatchResponse = await api.getObject(nestedId!);
      expect(afterPatchResponse.status()).toBe(200);
      expect(await afterPatchResponse.json()).toEqual(expect.objectContaining({
        id: nestedId,
        name: patchedName,
        data: replacement.data,
      }));

      const deleteResponse = await api.deleteObject(nestedId!);
      expect(deleteResponse.status()).toBe(200);
      expect((await deleteResponse.json()).message).toContain(nestedId);
      nestedId = undefined;
      expect((await api.getObject(created.id)).status()).toBe(404);
    } finally {
      if (nestedId) await api.cleanup(nestedId);
    }

    // 7. Create, retrieve, and delete a fixture with array-shaped custom data.
    const arrayPayload = {
      name: uniqueValue('api-array'),
      data: ['text', 9, false, { nested: 'value' }],
    };
    let arrayId: string | undefined;
    try {
      const createArrayResponse = await api.createObject(arrayPayload);
      expect(createArrayResponse.status()).toBe(200);
      const createdArrayObject = await createArrayResponse.json();
      arrayId = createdArrayObject.id;
      expect(createdArrayObject).toEqual(expect.objectContaining(arrayPayload));
      expect(typeof arrayId).toBe('string');

      const readArrayResponse = await api.getObject(arrayId!);
      expect(readArrayResponse.status()).toBe(200);
      expect(await readArrayResponse.json()).toEqual(expect.objectContaining(arrayPayload));

      const deleteArrayResponse = await api.deleteObject(arrayId!);
      expect(deleteArrayResponse.status()).toBe(200);
      expect((await deleteArrayResponse.json()).message).toContain(arrayId);
      arrayId = undefined;
    } finally {
      if (arrayId) await api.cleanup(arrayId);
    }

    // 8. Confirm PUT, PATCH, and DELETE do not operate on a nonexistent ID.
    const unknownPut = await api.replaceObject(unknownId, { name: 'missing', data: { value: true } });
    expect(unknownPut.status()).toBe(404);
    const unknownPatch = await api.patchObject(unknownId, { name: 'missing' });
    expect(unknownPatch.status()).toBe(404);
    const unknownDelete = await api.deleteObject(unknownId);
    expect(unknownDelete.status()).toBe(404);
    expect((await api.getObject(unknownId)).status()).toBe(404);

    // 9. Make a browser-originated JSON request from the documentation origin to verify CORS and preflight.
    await page.goto('https://restful-api.dev/');
    await page.addScriptTag({
      content: `
        (async () => {
          const response = await fetch('${API_BASE_URL}/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"name":'
          });
          return { status: response.status, body: await response.json() };
        })().then((result) => {
          const output = document.createElement('pre');
          output.id = 'public-api-cors-result';
          output.textContent = JSON.stringify(result);
          document.body.append(output);
        }).catch((error) => {
          const output = document.createElement('pre');
          output.id = 'public-api-cors-result';
          output.textContent = JSON.stringify({ error: String(error) });
          document.body.append(output);
        });
      `,
    });
    const corsResult = page.locator('#public-api-cors-result');
    await expect(corsResult).toBeAttached();
    const corsResponse = JSON.parse((await corsResult.textContent()) ?? '{}');
    expect(corsResponse).toEqual(expect.objectContaining({ status: 400 }));
    expect(corsResponse.body).toHaveProperty('error');
  });
});