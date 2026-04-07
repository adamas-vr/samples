declare module "robotjs" {
	export interface ScreenSize {
		width: number;
		height: number;
	}

	export interface Bitmap {
		image: Buffer;
		width: number;
		height: number;
		byteWidth: number;
		bitsPerPixel: number;
		bytesPerPixel: number;
	}

	export interface RobotJs {
		getScreenSize(): ScreenSize;
		screen: {
			capture(x: number, y: number, width: number, height: number): Bitmap;
		};
	}

	const robot: RobotJs;
	export default robot;
}
