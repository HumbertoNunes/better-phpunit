const findUp = require('find-up');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

module.exports = class PhpUnitCommand {
    constructor(options) {
        this.runFullSuite = options !== undefined
            ? options.runFullSuite
            : false;

        this.runFile = options !== undefined
            ? options.runFile
            : false;

        this.lastOutput;
        this.isPest = this._isPest();
        this.isClassBasedTest = this._isClassBasedTest();
    }

    get output() {
        if (this.lastOutput) {
            return this.lastOutput;
        }

        let suiteSuffix = vscode.workspace.getConfiguration('better-phpunit').get('suiteSuffix');
        suiteSuffix = suiteSuffix ? ' '.concat(suiteSuffix) : '';

        if (this.runFullSuite) {
            this.lastOutput = `${this.binary}${suiteSuffix}${this.suffix}`
        } else if (this.runFile) {
            this.lastOutput = `${this.binary} ${this.file}${this.configuration}${this.suffix}`;
        } else {
            this.lastOutput = `${this.binary} ${this.file}${this.filter}${this.configuration}${this.suffix}`;
        }

        return this.lastOutput;
    }

    get file() {
        return this._normalizePath(vscode.window.activeTextEditor.document.fileName);
    }

    get filter() {
        if (this.isPest) {
            return this.method ? ` --filter ${this.method}` : '';
        }
        
        return process.platform === "win32"
            ? (this.method ? ` --filter '^.*::${this.method}'` : '')
            : (this.method ? ` --filter '^.*::${this.method}( .*)?$'` : '');
    }

    get configuration() {
        let configFilepath = vscode.workspace.getConfiguration('better-phpunit').get('xmlConfigFilepath');
        if (configFilepath !== null) {
            return ` --configuration ${configFilepath}`;
        }
        return this.subDirectory
            ? ` --configuration ${this._normalizePath(path.join(this.subDirectory, 'phpunit.xml'))}`
            : '';
    }

    get suffix() {
        let suffix = vscode.workspace.getConfiguration('better-phpunit').get('commandSuffix');

        return suffix ? ' ' + suffix : ''; // Add a space before the suffix.
    }

	get windowsSuffix() {
        return process.platform === "win32"
            ? '.bat'
            : '';
    }

    get binary() {
        const binaryKey = this.isPest ? 'pestBinary' : 'phpunitBinary';

        if (vscode.workspace.getConfiguration('better-phpunit').get(binaryKey)) {
            return vscode.workspace.getConfiguration('better-phpunit').get(binaryKey)
        }

        const binary = this.isPest ? 'pest' : 'phpunit';

        return this.subDirectory
            ? this._normalizePath(path.join(this.subDirectory, 'vendor', 'bin', binary+this.windowsSuffix))
            : this._normalizePath(path.join(vscode.workspace.rootPath, 'vendor', 'bin', binary+this.windowsSuffix));
    }

    get subDirectory() {
        // find the closest phpunit.xml file in the project (for projects with multiple "vendor/bin/phpunit"s).
        let phpunitDotXml = findUp.sync(['phpunit.xml', 'phpunit.xml.dist'], { cwd: vscode.window.activeTextEditor.document.fileName });

        return path.dirname(phpunitDotXml) !== vscode.workspace.rootPath
            ? path.dirname(phpunitDotXml)
            : null;
    }

    get method() {
        let line = vscode.window.activeTextEditor.selection.active.line;
        let nextLine = vscode.window.activeTextEditor.document.lineAt(line + 1).text;
        let method;

        const isCursorInsideMethod = nextLine.match(/^\s*(?:public|private|protected)?\s*function\s*\w+\s*\(/) ||
                                     nextLine.match(/^\s*#\[Test\]/);

        if (isCursorInsideMethod) {
            return null;
        }

        while (line > 0) {
            const lineText = vscode.window.activeTextEditor.document.lineAt(line).text;
            const match = this.isPest && !this.isClassBasedTest ?
                lineText.match(/^\s*(?:it|test)\(([^,)]+)/m) :
                lineText.match(/^\s*(?:public|private|protected)?\s*function\s*(\w+)\s*\(.*$/);

            if (match) {
                method = match[1];
                break;
            }
            line = line - 1;
        }

        return method;
    }

    _isPest() {
        const start = Date.now();
        const composerJson = findUp.sync('composer.json', { cwd: vscode.window.activeTextEditor.document.fileName });

        if (!fs.existsSync(composerJson)) {
            return false;
        }

        const isPest = fs.readFileSync(composerJson, 'utf8').includes('"pestphp/pest"');
        const end = Date.now();
        console.log(`Checking for Pest: ${end - start}ms`)

        return isPest;
    }

    _normalizePath(path) {
        return path
            .replace(/\\/g, '/') // Convert backslashes from windows paths to forward slashes, otherwise the shell will ignore them.
            .replace(/ /g, '\\ '); // Escape spaces.
    }

    _isClassBasedTest() {
        const document = vscode.window.activeTextEditor.document;
        const content = document.getText();
        
        return content.match(/class\s+\w+\s+extends\s+TestCase/);
    }
}
