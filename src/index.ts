import sharp from 'sharp';
import fp from 'fastify-plugin';
import { Stream } from 'stream';
import merge from 'lodash/merge';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { FastifyModernImagesOptions, MinifyRequest } from './types';
import { getBestFormat, guard, isStream, stream2buffer, validatePayload, removeBackground } from './utils';

const defaults: FastifyModernImagesOptions = {
    regex: /.*/,
    quality: '7',
    rembg: {
        model: 'isnet-general-use'
    },
    compression: {
        jpeg: {
            enabled: true,
            format: 'jpeg',
            priority: 2,
            alpha: false,
            quality: {
                '9': 95,
                '8': 90,
                '7': 85,
                '6': 80,
                '5': 75,
                '4': 70,
                '3': 60,
                '2': 50,
                '1': 40
            },
            options: {},
            contentType: 'image/jpeg',
            supported: () => true
        },
        avif: {
            enabled: true,
            format: 'avif',
            priority: 4,
            alpha: true,
            quality: {
                '9': 87,
                '8': 79,
                '7': 70,
                '6': 66,
                '5': 61,
                '4': 54,
                '3': 42,
                '2': 38,
                '1': 34
            },
            options: {
                effort: 3
            },
            contentType: 'image/avif',
            supported: accept => accept.includes('image/avif')
        },
        webp: {
            enabled: true,
            format: 'webp',
            priority: 3,
            alpha: true,
            quality: {
                '9': 93,
                '8': 89,
                '7': 84,
                '6': 79,
                '5': 74,
                '4': 69,
                '3': 48,
                '2': 38,
                '1': 32
            },
            options: {},
            contentType: 'image/webp',
            supported: accept => accept.includes('image/webp')
        },
        png: {
            enabled: true,
            format: 'png',
            priority: 1,
            alpha: true,
            quality: {
                '9': 87,
                '8': 78,
                '7': 72,
                '6': 68,
                '5': 63,
                '4': 61,
                '3': 55,
                '2': 52,
                '1': 48
            },
            options: {},
            contentType: 'image/png',
            supported: () => true
        }
    }
};

async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
    const options: FastifyModernImagesOptions = merge(defaults, opts);

    // @ts-expect-error
    const contentTypes: string[] = Object.values(options.compression).map(item => item.contentType);

    fastify.addHook('onSend', async (request: FastifyRequest<MinifyRequest>, reply, payload) => {
        if (!guard(options.regex as RegExp, request.raw.url) || !validatePayload(reply.getHeader('Content-Type'), contentTypes, payload)) {
            return payload;
        }

        if (isStream(payload)) {
            payload = await stream2buffer(payload as Stream);
        }

        const ai = request.query.ai ?? request.query.a
        if (typeof ai !== 'undefined') {
            payload = await removeBackground(payload as Buffer, ai.length > 0 ? ai : options.rembg?.model);
        }

        const instance = sharp(payload as Buffer);

        const trim = request.query.trim ?? request.query.t
        if (typeof trim !== 'undefined') {
            instance.trim();
        }

        const metadata = await instance.metadata();

        const format = getBestFormat(request.headers.accept, metadata, Object.values(options.compression as any));

        if (!format) {
            request.log.warn(`No adequate format for image of type "${reply.getHeader('Content-Type')}" was found.`);
            return payload;
        }

        const rotation = request.query.rotation ?? request.query.r;
        instance.rotate(rotation ? parseInt(rotation) : undefined, {
            background: request.query.background ?? request.query.b
        });

        const uWidth = request.query.width ?? request.query.w;
        const uHeight = request.query.height ?? request.query.h;

        if (uWidth || uHeight) {
            instance.resize(parseInt(uWidth ?? '') || null, parseInt(uHeight ?? '') || null, {
                fit: request.query.fit ?? request.query.f ?? 'cover',
                position: request.query.position ?? request.query.p ?? 'centre',
                background: request.query.background ?? request.query.b
            });
        }

        const uQuality = request.query.quality ?? request.query.q ?? options.quality;
        // @ts-expect-error
        const quality = format.quality[uQuality];

        if (request.query.background || request.query.b) {
            instance.flatten({
                background: request.query.background ?? request.query.b
            });
        }

        const output = await instance.toFormat(format.format as any, merge(format.options, { quality })).toBuffer();

        request.log.info(
            `Input: ${reply.getHeader('Content-Type')}, Output: ${format.contentType}, Quality: ${quality}, Reduction: ${Math.round(
                (1 - output.length / (payload as Buffer).length) * 100
            )}%)`
        );

        reply.header('Content-Type', format.contentType);
        reply.header('Content-Length', output.length);

        return output;
    });
}

export default fp(fastifyModernImages, {
    fastify: '4.x',
    name: 'fastify-modern-images'
});
