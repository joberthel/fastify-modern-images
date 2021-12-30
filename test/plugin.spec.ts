import * as http from 'http';
import * as path from 'path';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import fastifyModernImages from '../src';
import fastifyStatic from 'fastify-static';
import fastify, { FastifyInstance } from 'fastify';

async function fetch(path, accept = ''): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: 'localhost',
                port: 4567,
                method: 'GET',
                path,
                headers: {
                    accept
                }
            },
            res => {
                resolve(res.headers['content-type']);
            }
        );

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
}

describe('plugin', () => {
    let server: FastifyInstance;

    before(async () => {
        server = fastify();

        server.register(fastifyModernImages);
        server.register(fastifyStatic, { root: path.join(__dirname, '../example/public'), prefix: '/' });

        server.get('/buffer.jpg', async (request, reply) => {
            const buffer = await fs.readFile(path.join(__dirname, '../example/public/test.jpg'));
            reply.header('Content-Type', 'image/jpeg').send(buffer);
        });

        server.get('/string.jpg', async (request, reply) => {
            reply.header('Content-Type', 'image/jpeg').send('foo bar');
        });

        server.get('/text.txt', async (request, reply) => {
            reply.header('Content-Type', 'text/plain').send('foo bar');
        });

        server.get('/test.svg', async (request, reply) => {
            reply.header('Content-Type', 'image/svg').send('foo bar');
        });

        server.get('/error.jpg', async (request, reply) => {
            reply.header('Content-Type', undefined).send('foo bar');
        });

        await server.listen(4567);
    });

    after(async () => {
        await server.close();
    });

    describe('buffer', () => {
        it('should return jpeg', async () => {
            expect(await fetch('/buffer.jpg')).to.eq('image/jpeg');
        });
    });

    describe('stream', () => {
        it('should return jpeg', async () => {
            expect(await fetch('/test.jpg')).to.eq('image/jpeg');
            expect(await fetch('/test.png')).to.eq('image/jpeg');
        });

        it('should return avif', async () => {
            expect(await fetch('/test.jpg', 'image/avif')).to.eq('image/avif');
            expect(await fetch('/test.jpg', 'image/avif,image/webp')).to.eq('image/avif');
            expect(await fetch('/test-alpha.png', 'image/avif,image/webp')).to.eq('image/avif');
        });

        it('should return webp', async () => {
            expect(await fetch('/test.jpg', 'image/webp')).to.eq('image/webp');
            expect(await fetch('/test-alpha.png', 'image/webp')).to.eq('image/webp');
        });

        it('should return png', async () => {
            expect(await fetch('/test-alpha.png')).to.eq('image/png');
        });
    });

    describe('passthrough', () => {
        it('should passthrough if no images', async () => {
            expect(await fetch('/text.txt')).to.eq('text/plain');
        });

        it('should passthrough if no stream or buffer', async () => {
            expect(await fetch('/string.jpg')).to.eq('image/jpeg');
        });

        it('should passthrough svg', async () => {
            expect(await fetch('/test.svg')).to.eq('image/svg');
        });

        it('should passthrough error', async () => {
            expect(await fetch('/error.jpg')).to.eq('');
        });
    });
});
