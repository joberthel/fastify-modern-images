import * as chai from 'chai';
import { PassThrough } from 'stream';
import * as chaiAsPromised from 'chai-as-promised';
import { stream2buffer, supportedFormats, isImage, getFormat } from '../src/utils';

chai.use(chaiAsPromised);

const { expect } = chai;

describe('utils', () => {
    it('should convert stream to buffer', async () => {
        let stream = new PassThrough();
        stream.write('foo bar');
        stream.end();

        expect((await stream2buffer(stream)).toString()).to.eq('foo bar');

        stream = new PassThrough();
        stream.write('foo bar');
        stream.destroy(new Error('foo-bar'));

        await expect(stream2buffer(stream)).to.eventually.be.rejectedWith('error converting stream - Error: foo-bar');
    });

    it('should return supported formats', () => {
        expect(supportedFormats().map(item => item.format)).to.contain('jpeg');
        expect(supportedFormats().map(item => item.format)).to.contain('png');
        expect(supportedFormats().map(item => item.format)).not.to.contain('avif');
        expect(supportedFormats().map(item => item.format)).not.to.contain('webp');

        expect(supportedFormats('image/webp').map(item => item.format)).not.to.contain('avif');
        expect(supportedFormats('image/webp').map(item => item.format)).to.contain('webp');

        expect(supportedFormats('image/avif').map(item => item.format)).to.contain('avif');
        expect(supportedFormats('image/avif').map(item => item.format)).not.to.contain('webp');

        expect(supportedFormats('image/webp,image/avif').map(item => item.format)).to.contain('avif');
        expect(supportedFormats('image/webp,image/avif').map(item => item.format)).to.contain('webp');
    });

    it('should check if content type is an image', () => {
        expect(isImage('image/jpeg')).to.be.true;
        expect(isImage('text/plain')).to.be.false;
    });

    it('should return format from content type', () => {
        expect(getFormat('image/jpeg')).to.eq('jpeg');
        expect(getFormat('text/plain')).to.eq('');
    });
});
