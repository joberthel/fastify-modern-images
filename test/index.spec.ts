import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import { expect } from 'chai';
import fastifyModernImages from '../src';
import fastifyStatic from '@fastify/static';

import fastify, { FastifyInstance } from 'fastify';

function sleep(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    })
}

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
                resolve(res.headers['content-type'] || '');
            }
        );

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
}

describe('default behaviour', () => {
    let server: FastifyInstance;

    before(async () => {
        server = fastify();

        server.register(fastifyModernImages);
        server.register(fastifyStatic, { root: path.join(__dirname, '../example/public'), prefix: '/' });

        server.get('/buffer.jpg', async (request, reply) => {
            const buffer = await fs.readFile(path.join(__dirname, '../example/public/test.jpg'));
            return reply.header('Content-Type', 'image/jpeg').send(buffer);
        });

        await server.listen({ port: 4567 });
    });

    after(async () => {
        await sleep(10);
        await server.close();
    });

    it('should return avif', async () => {
        expect(await fetch('/test.jpg', 'image/avif,image/webp')).to.eq('image/avif');
    });

    it('should return webp', async () => {
        expect(await fetch('/test.jpg', 'image/webp')).to.eq('image/webp');
    });

    it('should return jpeg', async () => {
        expect(await fetch('/test.jpg')).to.eq('image/jpeg');
    });

    it('should return png', async () => {
        expect(await fetch('/test-alpha.png')).to.eq('image/png');
    });

    it('should work with buffer', async () => {
        expect(await fetch('/buffer.jpg', 'image/avif,image/webp')).to.eq('image/avif');
    });

    it('should return jpeg with transformation', async () => {
        expect(await fetch('/test.jpg?width=150')).to.eq('image/jpeg');
        expect(await fetch('/test.jpg?height=150')).to.eq('image/jpeg');
        expect(await fetch('/test.jpg?width=150&height=150&fit=contain')).to.eq('image/jpeg');
        expect(await fetch('/test.jpg?width=150&height=150&position=left')).to.eq('image/jpeg');
    });

    it('should return jpeg with transformation and background', async () => {
        expect(await fetch('/test.jpg?width=800&height=200&fit=contain&background=white')).to.eq('image/jpeg');
    });

    it('should return jpeg with rotation', async () => {
        expect(await fetch('/test.jpg?rotation=45')).to.eq('image/jpeg');
        expect(await fetch('/test.jpg?r=45')).to.eq('image/jpeg');
    });

    it('should return jpeg with rotation and background', async () => {
        expect(await fetch('/test.jpg?rotation=45&background=white')).to.eq('image/jpeg');
        expect(await fetch('/test.jpg?r=45&bg=white')).to.eq('image/jpeg');
    });

    it('should return jpeg with different quality', async () => {
        expect(await fetch('/test.jpg?quality=3')).to.eq('image/jpeg');
        expect(await fetch('/test.jpg?q=3')).to.eq('image/jpeg');
    });

    it('should return trimmed jpeg', async () => {
        expect(await fetch('/product.jpeg?trim')).to.eq('image/jpeg');
        expect(await fetch('/product.jpeg?t')).to.eq('image/jpeg');
    });

    // it('should return image with removed background', async () => {
    //     expect(await fetch('/product.jpeg?ai&background=red')).to.eq('image/png');
    //     expect(await fetch('/product.jpeg?a&b=red')).to.eq('image/png');
    // });
});

describe('guard behaviour', () => {
    let server: FastifyInstance;

    before(async () => {
        server = fastify();

        server.register(fastifyModernImages, { regex: /^[^?]+$/ });
        server.register(fastifyStatic, { root: path.join(__dirname, '../example/public'), prefix: '/' });

        await server.listen({ port: 4567 });
    });

    after(async () => {
        await sleep(10);
        await server.close();
    });

    it('should return avif', async () => {
        expect(await fetch('/test.jpg?foo', 'image/avif,image/webp')).to.eq('image/jpeg');
    });

    it('should return png', async () => {
        expect(await fetch('/test.png?foo', 'image/avif,image/webp')).to.eq('image/png');
    });
});

describe('passthrough behaviour', () => {
    let server: FastifyInstance;

    before(async () => {
        server = fastify();

        server.register(fastifyModernImages, {
            compression: {
                jpeg: { enabled: false, format: 'jpeg' },
                webp: { enabled: false, format: 'webp' },
                avif: { enabled: false, format: 'avif' },
                png: { enabled: false, format: 'png' }
            }
        });
        server.register(fastifyStatic, { root: path.join(__dirname, '../example/public'), prefix: '/' });

        await server.listen({ port: 4567 });
    });

    after(async () => {
        await sleep(10);
        await server.close();
    });

    it('should return jpeg', async () => {
        expect(await fetch('/test.jpg', 'image/avif,image/webp')).to.eq('image/jpeg');
    });
});
