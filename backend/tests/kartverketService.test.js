const express = require('express');
const request = require('supertest');
const axios = require('axios');

jest.mock('axios');

describe('Kartverket satellite image cache', () => {
  let app;

  beforeAll(() => {
    delete process.env.API_ACCESS_KEY;
    process.env.MOCK_SATELLITE_IMAGE_URL = '';

    const apiRouter = require('../src/routes/api');

    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
  });

  beforeEach(async () => {
    axios.mockReset();
    await request(app).delete('/api/satellite-image/cache/clear');
  });

  it('returns cached response for repeated coordinate lookups', async () => {
    const fakeImage = Buffer.alloc(1024, 1);
    axios.mockResolvedValue({
      data: fakeImage,
      headers: { 'content-type': 'image/jpeg' },
    });

    const firstResponse = await request(app)
      .get('/api/satellite-image')
      .query({ lat: 59.1234, lon: 10.4321, width: 256, height: 256 })
      .expect(200);

    expect(firstResponse.body).toMatchObject({ success: true });
    expect(firstResponse.body.data.cached).toBe(false);
    expect(axios).toHaveBeenCalledTimes(1);

    const secondResponse = await request(app)
      .get('/api/satellite-image')
      .query({ lat: 59.1234, lon: 10.4321, width: 256, height: 256 })
      .expect(200);

    expect(secondResponse.body).toMatchObject({ success: true });
    expect(secondResponse.body.data.cached).toBe(true);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  it('clears cache via the administrative endpoint', async () => {
    const fakeImage = Buffer.alloc(1024, 2);
    axios.mockResolvedValue({
      data: fakeImage,
      headers: { 'content-type': 'image/png' },
    });

    const firstResponse = await request(app)
      .get('/api/satellite-image')
      .query({ lat: 60.0001, lon: 11.0001, width: 256, height: 256 })
      .expect(200);

    expect(firstResponse.body.data.cached).toBe(false);
    expect(axios).toHaveBeenCalledTimes(1);

    const clearResponse = await request(app)
      .delete('/api/satellite-image/cache/clear')
      .expect(200);

    expect(clearResponse.body).toEqual({
      success: true,
      message: 'Image cache cleared',
    });

    const secondResponse = await request(app)
      .get('/api/satellite-image')
      .query({ lat: 60.0001, lon: 11.0001, width: 256, height: 256 })
      .expect(200);

    expect(secondResponse.body.data.cached).toBe(false);
    expect(axios).toHaveBeenCalledTimes(2);
  });
});
