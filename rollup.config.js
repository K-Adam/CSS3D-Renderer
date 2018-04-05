
import babel from 'rollup-plugin-babel';
import babelrc from 'babelrc-rollup';

import path from 'path';
import fs from 'fs';
import license from 'rollup-plugin-license';

export default {
	input: 'src/C3R.js',
	plugins: [],
	// sourceMap: true,
	output: [
		{
			format: 'umd',
			name: 'C3R',
			file: 'build/C3R.js',
			indent: '\t'
		},
		{
			format: 'es',
			file: 'build/C3R.module.js',
			indent: '\t'
		}
	],
    plugins: [
        babel(babelrc()),
        license({
            sourceMap: true,

            banner: "@license\n"+fs.readFileSync(path.join(__dirname, 'LICENSE'), "utf8")
        })
    ]
};