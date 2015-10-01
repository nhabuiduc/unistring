#!/usr/bin/node
/*
 * grapheme break property generator
 * =================================
 *
 * format:
 *
 *   <lower code point (4 bytes, little endian)> <range count (2 bytes, little endian)> <property value (2 byte, little endian)>
 *
 *   note: code point order must be sorted.
 */

var fs = require('fs');
var http = require('http');
var args = require('minimist')(process.argv.slice(2));

function loadFiles (fileURLs) {
	if (fileURLs.length == 0) {
		console.log('all files are exists.');
		return;
	}
	var loadSpec = fileURLs.shift();
	var url = loadSpec.url;
	var path = loadSpec.path;
	if (path.substr(-1) == '/') {
		path += /[^\/]+$/.exec(url)[0];
	}
	try {
		var stat = fs.statSync(path);
		console.log('exists: ' + path);
		loadFiles(fileURLs);
	}
	catch (e) {
		if (e.code != 'ENOENT') {
			console.log('exception: ' + e.message);
			throw err;
		}
		console.log('not exists, loading: ' + url);
		http.get(url, function (res) {
			var content = '';
			res.setEncoding('utf8');
			res.on('data', function (chunk) {content += chunk});
			res.on('end', function (res) {
				fs.writeFileSync(path, content, 'utf8');
				console.log('loaded: ' + path);
				loadFiles(fileURLs);
			});
		});
	}
}

function setup (params) {
	fs.readFile(params.srcFileName, 'utf8', function (err, data) {
		if (err) throw err;
		prepare(params, data);
	});
}

function prepare (params, data) {
	data = data.split('\n');
	params.onSourceLoad && (data = params.onSourceLoad(data));

	for (var i = 0, goal = data.length; i < goal; i++) {
		var line = data[i];
		line = line.replace(/#.*/, '');
		line = line.replace(/^\s+|\s+$/g, '');
		if (line == '') continue;

		var re = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(.+)/.exec(line);
		if (!re) continue;

		if (!re[2]) {
			re[2] = re[1];
		}
		if (!(re[3] in params.propIndex)) {
			params.propIndex[re[3]] = Object.keys(params.propIndex).length;
		}

		params.propData.push([
			parseInt(re[1], 16),
			parseInt(re[2], 16),
			params.propIndex[re[3]]
		]);
	}

	params.onDataCreate && (params.propData = params.onDataCreate(params.propData));
	params.propData.sort(function (a, b) {return a[0] - b[0]});
	makeJs(params);
}

function makeJs (params) {
	function output () {
		console.log(Array.prototype.slice.call(arguments).join('\n'));
	}
	function self () {
		return process.argv.map(function(s, index) {
			return index < 2 ? /[^\/]+$/.exec(s)[0] : s;
		}).join(' ');
	}

	var propData = params.propData;
	var propIndex = params.propIndex;

	output(
		'\t// GENERATED CODE START <<<1',
		'\t// This data was generated by the command \'' + self() + '\'.',
		'\tvar ' + params.tableName + ' = \'\\'
	);

	/*
	 * table
	 */

	var tmp = new Buffer(propData.length * 8);
	var offset = 0;
	for (var i = 0, goal = propData.length; i < goal; i++) {
		tmp.writeUInt32LE(propData[i][0], offset);
		offset += 4;

		tmp.writeUInt16LE(propData[i][1] - propData[i][0] + 1, offset);
		offset += 2;

		tmp.writeUInt16LE(propData[i][2], offset);
		offset += 2;
	}

	tmp = tmp.toString('hex').toUpperCase().replace(/.{80}/g, '$&\\\n');
	output(
		tmp + '\'.replace(',
		'\t/[0-9A-F]{2}/g,',
		'\tfunction($0){return String.fromCharCode(parseInt($0, 16))});',
		''
	);

	/*
	 * property name
	 */

	for (var key in propIndex) {
		output('\tvar ' + params.constPrefix + '_' + key + ' = ' + propIndex[key] + ';');
	}
	output('');

	/*
	 * length of struct
	 */

	output(
		'\tvar ' + params.structLengthVarName + ' = 8;',
		''
	);

	/*
	 * name convert function
	 */

	output(
		'\tfunction get' + params.constPrefix + 'CodeFromName (name) {',
		'\t\tswitch (name) {'
	);
	for (var key in propIndex) {
		output('\t\tcase \'' + key + '\': return ' + params.constPrefix + '_' + key + ';');
	}
	output(
		'\t\t}',
		'\t\treturn undefined;',
		'\t}'
	);

	output(
		'\t// GENERATED CODE END',
		'\t// >>>'
	);
}

function main () {
	var params = {
		unicodeVersion: '8.0.0',
		propData: []
	};

	if (args.u || args['unicode-version']) {
		params.unicodeVersion = args.u || args['unicode-version'];
	}

	if (args.l || args['load-files']) {
		var files = [
			{
				url: 'http://www.unicode.org/Public/#version#/ucd/auxiliary/GraphemeBreakProperty.txt',
				path: __dirname + '/'
			},
			{
				url: 'http://www.unicode.org/Public/#version#/ucd/auxiliary/WordBreakProperty.txt',
				path: __dirname + '/'
			},
			{
				url: 'http://www.unicode.org/Public/#version#/ucd/auxiliary/GraphemeBreakTest.txt',
				path: __dirname + '/../test/'
			},
			{
				url: 'http://www.unicode.org/Public/#version#/ucd/auxiliary/WordBreakTest.txt',
				path: __dirname + '/../test/'
			}
		];
		files.forEach(function (spec) {
			spec.url = spec.url.replace('#version#', params.unicodeVersion);
		});
		loadFiles(files);
		return;
	}

	if (args.g || args['grapheme-break-properties']) {
		params.srcFileName = __dirname + '/GraphemeBreakProperty.txt';
		params.propIndex = {
			'Other': 0,
			'SOT': 1,
			'EOT': 2
		};
		params.tableName = 'GRAPHEME_BREAK_PROPS';
		params.structLengthVarName = 'GRAPHEME_BREAK_PROP_UNIT_LENGTH';
		params.constPrefix = 'GBP';
	}

	else if (args.w || args['word-break-properties']) {
		params.srcFileName = __dirname + '/WordBreakProperty.txt';
		params.propIndex = {
			'Other': 0,
			'SOT': 1,
			'EOT': 2
		};
		params.tableName = 'WORD_BREAK_PROPS';
		params.structLengthVarName = 'WORD_BREAK_PROP_UNIT_LENGTH';
		params.constPrefix = 'WBP';
		params.onSourceLoad = function (data) {
			// strip Katakana
			data = data.filter(function (line) {
				return !/;\s*Katakana\s*#/.test(line);
			});

			// override customized data
			try {
				var dataString = data.join('\n');
				var overrides = fs.readFileSync(__dirname + '/WordBreakOverrides.txt', 'utf8')
					.split('\n')
					.filter(function (line) {
						var re = /^([0-9A-F]+(\.\.[0-9A-F]+)?)/.exec(line);
						return re ? dataString.indexOf('\n' + re[1]) < 0 : true;
					});

				data.push.apply(data, overrides);
			}
			catch (e) {
				if (e.code != 'ENOENT') throw e;
			}

			return data;
		};
	}

	if (!params.srcFileName || args.h || args['?'] || args.help) {
		console.log([
			'options:',
			'  -u --unicode-version=<version>',
			'  -l --load-files',
			'  -g --grapheme-break-properties',
			'  -w --word-break-properties'
		].join('\n'));
		process.exit(1);
	}

	setup(params);
}

main();

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker :
