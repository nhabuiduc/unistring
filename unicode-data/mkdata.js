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
var srcFileName = __dirname + '/GraphemeBreakProperty.txt';
var propData = [];
var propIndex = {
	'Other': 0,
	'SOT': 1,
	'EOT': 2
};

function setup (next) {
	fs.readFile(srcFileName, 'utf8', function (err, data) {
		if (err) throw err;
		data = data.split('\n');
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
			if (!(re[3] in propIndex)) {
				propIndex[re[3]] = Object.keys(propIndex).length;
			}

			propData.push([
				parseInt(re[1], 16),
				parseInt(re[2], 16),
				propIndex[re[3]]
			]);
		}

		propData.sort(function (a, b) {return a[0] - b[0]});
		next();
	});
}

function makeJs () {
	function x2 (v) {
		return ('00' + v.toString(16).toUpperCase()).substr(-2);
	}
	function output () {
		console.log(Array.prototype.slice.call(arguments).join('\n'));
	}
	function self () {
		return process.argv.slice(0, 2).map(function(s) {
			return /[^\/]+$/.exec(s)[0];
		}).join(' ');
	}

	output(
		'\t// GENERATED CODE START <<<1',
		'\t// This data was generated by the command \'' + self() + '\'.',
		'\tvar GRAPHEME_BREAK_PROPS = \'\\'
	);

	/*
	 * table
	 */

	var tmp = '';
	for (var i = 0, goal = propData.length; i < goal; i++) {
		var a = propData[i][0];
		tmp +=
			x2((a      ) & 0xff) +
			x2((a >>  8) & 0xff) +
			x2((a >> 16) & 0xff) +
			x2((a >> 24) & 0xff);

		var a = propData[i][1] - propData[i][0] + 1;
		if (a >= 0x10000) {
			throw new Error('length overflow!');
		}
		tmp +=
			x2((a      ) & 0xff) +
			x2((a >>  8) & 0xff);

		var a = propData[i][2];
		tmp +=
			x2((a      ) & 0xff) +
			x2((a >>  8) & 0xff);

		if (tmp.length >= 80) {
			console.log(tmp + '\\');
			tmp = '';
		}
	}

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
		console.log('\tvar GBP_' + key + ' = ' + propIndex[key] + ';');
	}
	console.log('');

	/*
	 * length of struct
	 */

	output(
		'\tvar GRAPHEME_BREAK_PROP_UNIT_LENGTH = 8;',
		''
	);

	/*
	 * name convert function
	 */

	output(
		'\tfunction getGBPCodeFromName (name) {',
		'\t\tswitch (name) {'
	);
	for (var key in propIndex) {
		console.log('\t\tcase \'' + key + '\': return GBP_' + key + ';');
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

setup(makeJs);

// vim:set ts=4 sw=4 fenc=UTF-8 ff=unix ft=javascript fdm=marker :