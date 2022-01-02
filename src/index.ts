import sharp from 'sharp';
import fp from 'fastify-plugin';
import { Stream } from 'stream';
import merge from 'lodash/merge';
import { getBestFormat, guard, stream2buffer, validatePayload } from './utils';
import { FastifyInstance } from 'fastify';

const imageFormats = <const>['avif', 'webp', 'jpeg', 'png'];

export type ImageFormat = typeof imageFormats[number];

export type FastifyModernImagesOptions = {
    regex?: RegExp;
    quality?: string;
    compression?: Record<string, FastifyModernImagesOptionsCompression>;
};

export type FastifyModernImagesOptionsCompression = {
    enabled?: boolean;
    format?: ImageFormat;
    priority?: number;
    alpha?: boolean;
    quality?: Record<string, number>;
    options?: Record<string, any>;
    contentType?: string;
    supported?: (accept: string) => boolean;
};

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

export async function fastifyModernImages(fastify: FastifyInstance, opts: FastifyModernImagesOptions) {
    const options: FastifyModernImagesOptions = merge(defaults, opts);

    // @ts-expect-error
    const contentTypes: string[] = Object.values(options.compression).map(item => item.contentType);

    fastify.addHook('onSend', async (request, reply, payload) => {
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
            return payload;
        }

        reply.header('Content-Type', format.contentType);

        // @ts-expect-error
        return instance.toFormat(format.format as any, merge(format.options, { quality: format.quality[options.quality] })).toBuffer();
    });
}

export default fp(fastifyModernImages, {
    fastify: '3.x',
    name: 'fastify-modern-images'
});
