// The two public forms. Open to the internet, so most of this is about limits
// and about telling the truth when nothing was stored.
import express from 'express';
import request from 'supertest';

const save = jest.fn();
const find = jest.fn();
let dataSource: unknown = {getRepository: () => ({create: (r: object) => r, save, find})};

jest.mock('@/configurations/playback', () => ({db: {enabled: true}}));
jest.mock('@/configurations/typeorm.config', () => ({
  initDataSource: jest.fn(async () => dataSource),
}));

import {reports} from '@/router/api/reports';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', reports);
  return app;
};

// the limiter keys on the forwarded address, so each test uses its own
const from = (ip: string) => ({'x-forwarded-for': ip});
const good = {title: 'Seeking jumps back', body: 'Drag the bar, it snaps to where it was.'};

describe('POST /api/bugreport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dataSource = {getRepository: () => ({create: (r: object) => r, save, find})};
    save.mockImplementation(async (row: Record<string, unknown>) => ({...row, id: 42}));
  });

  it('stores the report and answers with its reference', async () => {
    const res = await request(makeApp()).post('/api/bugreport').set(from('1.1.1.1')).send(good);

    expect(res.status).toBe(201);
    expect(res.body.ref).toBe('VSK-42');
    // the body is never echoed back, only the ticket
    expect(res.body.body).toBeUndefined();
  });

  it('refuses a report with no details', async () => {
    const res = await request(makeApp()).post('/api/bugreport').set(from('2.2.2.2')).send({title: 'x'});

    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses an address that is not one', async () => {
    const res = await request(makeApp())
      .post('/api/bugreport').set(from('3.3.3.3'))
      .send({...good, email: 'not-an-address'});

    expect(res.status).toBe(400);
  });

  it('takes a report without an address at all', async () => {
    const res = await request(makeApp()).post('/api/feedback').set(from('4.4.4.4')).send(good);

    expect(res.status).toBe(201);
  });

  it('says nothing was recorded when storage is gone', async () => {
    // the one failure the person needs to hear about: retyping it is the fix
    dataSource = null;

    const res = await request(makeApp()).post('/api/bugreport').set(from('5.5.5.5')).send(good);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/could not record/i);
  });

  it('turns away a second report from the same address straight away', async () => {
    const app = makeApp();
    const first = await request(app).post('/api/bugreport').set(from('6.6.6.6')).send(good);
    const second = await request(app).post('/api/bugreport').set(from('6.6.6.6')).send(good);

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    // one report stored, not two. `submit` saves the row twice — once to
    // create it, once to record what delivery did — so the creations are the
    // calls that arrive without an id yet.
    const created = save.mock.calls.filter(([row]) => (row as {id?: number}).id === undefined);
    expect(created).toHaveLength(1);
  });
});

describe('POST /api/betatest', () => {
  // the whole submission, as the form sends it
  const signup = {
    email: 'tester@example.com',
    vk: 'vk.com/someone',
    agreeVk: 'on',
    agreeReport: 'on',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource = {getRepository: () => ({create: (r: object) => r, save, find})};
    save.mockImplementation(async (row: Record<string, unknown>) => ({...row, id: 9}));
  });

  it('records the signup and answers with its reference', async () => {
    const res = await request(makeApp()).post('/api/betatest').set(from('10.0.0.1')).send(signup);

    expect(res.status).toBe(201);
    expect(res.body.ref).toBe('VSK-9');
  });

  it('keeps the address out of the title and in the column', async () => {
    // the title is the only field the public list shows, so it must not carry
    // the thing the person gave us in confidence
    await request(makeApp()).post('/api/betatest').set(from('10.0.0.2')).send(signup);

    const [created] = save.mock.calls.find(([row]) => (row as {id?: number}).id === undefined)!;
    const row = created as Record<string, string>;
    expect(row.kind).toBe('tester');
    expect(row.title).not.toContain('tester@example.com');
    expect(row.email).toBe('tester@example.com');
    expect(row.body).toContain('vk.com/someone');
  });

  it('refuses a signup with no address — it is what Play adds them by', async () => {
    const res = await request(makeApp())
      .post('/api/betatest').set(from('10.0.0.3'))
      .send({...signup, email: ''});

    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a signup with no VK profile', async () => {
    const res = await request(makeApp())
      .post('/api/betatest').set(from('10.0.0.4'))
      .send({...signup, vk: ''});

    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a signup that skipped a term', async () => {
    // the terms are checked here as well as in the form: a submission missing
    // one did not come from the form
    const res = await request(makeApp())
      .post('/api/betatest').set(from('10.0.0.5'))
      .send({...signup, agreeReport: undefined});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/terms/i);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('GET /api/reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dataSource = {getRepository: () => ({create: (r: object) => r, save, find})};
  });

  it('lists what came in without anyone s address', async () => {
    find.mockResolvedValue([
      {id: 7, kind: 'bug', title: 'Seeking jumps back', status: 'open',
       email: 'someone@example.com', body: 'private', createdAt: new Date('2026-11-02')},
    ]);

    const res = await request(makeApp()).get('/api/reports');

    expect(res.status).toBe(200);
    // bug and feedback only -- a tester signup is not a report
    expect(find.mock.calls[0][0].where).toEqual([{kind: 'bug'}, {kind: 'feedback'}]);
    expect(res.body.items[0]).toMatchObject({ref: 'VSK-7', kind: 'bug', status: 'open'});
    // a public page must not publish the thing the form exists to keep private
    expect(JSON.stringify(res.body)).not.toContain('someone@example.com');
    expect(JSON.stringify(res.body)).not.toContain('private');
  });
});
