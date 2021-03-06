import sharp from 'sharp';
import fp from 'fastify-plugin';
import { Stream } from 'stream';
import merge from 'lodash/merge';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { FastifyModernImagesOptions, MinifyRequest } from './types';
import { getBestFormat, guard, stream2buffer, validatePayload } from './utils';

const defaults: FastifyModernImagesOptions = {
    regex: /.*/,
    quality: '7',
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
                speed: 7
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

        if (payload instanceof Stream) {
            payload = await stream2buffer(payload);
        }

        const instance = sharp(payload as Buffer);
        const metadata = await instance.metadata();

        const format = getBestFormat(request.headers.accept, metadata, Object.values(options.compression as any));

        if (format == false) {
            request.log.warn(`No adequate format for image of type "${reply.getHeader('Content-Type')}" was found.`);
            return payload;
        }

        // @ts-expect-error
        const quality = format.quality[request.query.quality || options.quality];

        if (request.query.width || request.query.height) {
            instance.resize(parseInt(request.query.width || '') || null, parseInt(request.query.height || '') || null, {
                fit: request.query.fit || 'cover',
                position: request.query.position || 'centre'
            });
        }

        const output = await instance.toFormat(format.format as any, merge(format.options, { quality })).toBuffer();

        request.log.info(
            `Input: ${reply.getHeader('Content-Type')}, Output: ${format.contentType}, Quality: ${quality}, Reduction: ${Math.round(
                (1 - output.length / (payload as Buffer).length) * 100
            )}%)`
        );

        reply.header('Content-Type', format.contentType);

        return output;
    });
}

export default fp(fastifyModernImages, {
    fastify: '3.x',
    name: 'fastify-modern-images'
});
