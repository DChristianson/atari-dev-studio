"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const vscode = require("vscode");
const application = require("../application");
const filesystem = require("../filesystem");
class CompilerBase {
    constructor(id, name, extensions, folderOrPath) {
        // features
        this.IsRunning = false;
        // Note: these need to be in reverse order compared to how they are read
        this.DebuggerExtensions = new Map([["-s", ".sym"], ["-l", ".lst"]]);
        this.CustomFolderOrPath = false;
        this.FolderOrPath = "";
        this.Args = "";
        this.Format = "";
        this.Verboseness = "";
        this.channelName = "compiler";
        this.outputChannel = vscode.window.createOutputChannel(this.channelName);
        this.configuration = vscode.workspace.getConfiguration(application.Id, null);
        this.FileName = "";
        this.CompiledFileName = "";
        this.CompiledSubFolder = "";
        this.CompiledExtensionName = ".bin";
        this.CompiledSubFolderName = "bin";
        this.GenerateDebuggerFiles = false;
        this.CleanUpCompilationFiles = false;
        this.WorkspaceFolder = "";
        this.Id = id;
        this.Name = name;
        this.Extensions = extensions;
        this.DefaultFolderOrPath = folderOrPath;
    }
    ;
    dispose() {
        console.log('debugger:CompilerBase.dispose');
    }
    BuildGameAsync(document) {
        return __awaiter(this, void 0, void 0, function* () {
            // Set
            this.Document = document;
            // Process
            if (yield !this.InitialiseAsync())
                return false;
            return yield this.ExecuteCompilerAsync();
        });
    }
    BuildGameAndRunAsync(document) {
        return __awaiter(this, void 0, void 0, function* () {
            // Process
            if (yield !this.BuildGameAsync(document))
                return false;
            // TODO: launch emulator here
            return true;
        });
    }
    InitialiseAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('debugger:CompilerBase.InitialiseConfigurationAsync');
            // Already running?
            if (this.IsRunning) {
                // Notify
                this.notify(`The ${this.Name} compiler is already running! If you want to cancel the compilation activate the Stop/Kill command.`);
                return false;
            }
            // Configuration
            if (!(yield this.LoadConfiguration()))
                return false;
            // Activate output window?
            if (!this.configuration.get(`${application.Name}.editor.preserveCodeEditorFocus`)) {
                this.outputChannel.show();
            }
            // Clear output content?
            if (this.configuration.get(`${application.Name}.editor.clearPreviousOutput`)) {
                this.outputChannel.clear();
            }
            // Save files?
            if (this.configuration.get(`${application.Name}.editor.saveAllFilesBeforeRun`)) {
                vscode.workspace.saveAll();
            }
            else if (this.configuration.get(`${application.Name}.editor.saveFileBeforeRun`)) {
                if (this.Document)
                    this.Document.save();
            }
            // Result
            return true;
        });
    }
    RepairFilePermissionsAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            return true;
        });
    }
    LoadConfiguration() {
        console.log('debugger:CompilerBase.LoadConfiguration');
        // Reset
        this.CustomFolderOrPath = false;
        this.FolderOrPath = this.DefaultFolderOrPath;
        this.Args = "";
        this.Format = "";
        this.Verboseness = "";
        // Compiler
        let userCompilerFolder = this.configuration.get(`${application.Name}.${this.Id}.compilerFolder`);
        if (userCompilerFolder) {
            // Validate (user provided)
            if (!filesystem.FolderExists(userCompilerFolder)) {
                // Notify
                this.notify(`ERROR: Cannot locate your chosen ${this.Name} compiler folder '${userCompilerFolder}'`);
                return false;
            }
            // Set
            this.FolderOrPath = userCompilerFolder;
            this.CustomFolderOrPath = true;
        }
        // Compiler (other)
        this.Args = this.configuration.get(`${application.Name}.${this.Id}.compilerArgs`, "");
        this.Format = this.configuration.get(`${application.Name}.${this.Id}.compilerFormat`, "");
        this.Verboseness = this.configuration.get(`${application.Name}.${this.Id}.compilerVerboseness`, "");
        // Compilation
        this.GenerateDebuggerFiles = this.configuration.get(`${application.Name}.compilation.generateDebuggerFiles`, true);
        this.CleanUpCompilationFiles = this.configuration.get(`${application.Name}.compilation.cleanupCompilationFiles`, true);
        // System
        this.WorkspaceFolder = this.getWorkspaceFolder();
        this.FileName = path.basename(this.Document.fileName);
        this.CompiledFileName = `${this.FileName}${this.CompiledExtensionName}`;
        this.CompiledSubFolder = path.join(this.WorkspaceFolder, this.CompiledSubFolderName);
        // Result
        return true;
    }
    VerifyCompiledFileSizeAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('debugger:CompilerBase.VerifyCompiledFileSize');
            // Prepare
            let compiledFilePath = path.join(this.WorkspaceFolder, this.CompiledFileName);
            // Process
            let stats = yield filesystem.GetFileStats(compiledFilePath);
            if (stats) {
                // Validate
                if (stats.size > 0) {
                    return true;
                }
                // Notify
                this.notify(`ERROR: Failed to create compiled file '${this.CompiledFileName}'. The file size is 0 bytes...`);
            }
            // Failed
            return false;
        });
    }
    MoveFilesToBinFolderAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            // Note: generateDebuggerFile - there are different settings for each compiler
            console.log('debugger:CompilerBase.MoveFilesToBinFolder');
            // Create directory?
            if (yield !filesystem.MakeDir(this.CompiledSubFolder)) {
                // Notify
                this.notify(`ERROR: Failed to create folder '${this.CompiledSubFolderName}'`);
                return false;
            }
            // Prepare
            let oldPath = path.join(this.WorkspaceFolder, this.CompiledFileName);
            let newPath = path.join(this.CompiledSubFolder, this.CompiledFileName);
            // Move compiled file
            if (yield !filesystem.RenameFile(oldPath, newPath)) {
                // Notify
                this.notify(`ERROR: Failed to move file from '${this.CompiledFileName}' to ${this.CompiledSubFolderName} folder`);
                return false;
            }
            // Notify
            this.notify(`Moved compiled file '${this.CompiledFileName}' to ${this.CompiledSubFolderName} folder...`);
            // Move all debugger files?
            if (this.GenerateDebuggerFiles) {
                var debuggerFile = "";
                // Process
                this.DebuggerExtensions.forEach((extension, arg) => __awaiter(this, void 0, void 0, function* () {
                    // Prepare
                    debuggerFile = `${this.FileName}${extension}`;
                    let oldPath = path.join(this.WorkspaceFolder, debuggerFile);
                    let newPath = path.join(this.CompiledSubFolder, debuggerFile);
                    // Move compiled file
                    if (yield !filesystem.RenameFile(oldPath, newPath)) {
                        // Notify            
                        let message = `ERROR: Failed to move file '${debuggerFile}' to ${this.CompiledSubFolderName} folder`;
                        this.outputChannel.appendLine(message);
                        console.log(`debugger:${message}`);
                    }
                    ;
                    // Notify
                    this.notify(`Moved debugger files to ${this.CompiledSubFolderName} folder...`);
                }));
            }
            // Return
            return true;
        });
    }
    RemoveCompilationFilesAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('debugger:CompilerBase.RemoveCompilationFilesAsync');
            // Override to language specific items
            // Make sure to callback here for the debugger stuff
            // Debugger files
            var debuggerFile = "";
            // Process
            this.DebuggerExtensions.forEach((extension, arg) => __awaiter(this, void 0, void 0, function* () {
                // Prepare
                debuggerFile = `${this.FileName}${extension}`;
                let debuggerFilePath = path.join(this.WorkspaceFolder, debuggerFile);
                // Process
                yield filesystem.RemoveFile(debuggerFilePath);
            }));
            // Result
            return true;
        });
    }
    getWorkspaceFolder() {
        console.log('debugger:CompilerBase.getWorkspaceFolder');
        // Workspace
        if (vscode.workspace.workspaceFolders) {
            if (this.Document) {
                let workspaceFolder = vscode.workspace.getWorkspaceFolder(this.Document.uri);
                if (workspaceFolder) {
                    return workspaceFolder.uri.fsPath;
                }
            }
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        // Document
        if (this.Document)
            return path.dirname(this.Document.fileName);
        return "";
    }
    notify(message) {
        this.outputChannel.appendLine(message);
        console.log(`debugger:${message}`);
    }
}
exports.CompilerBase = CompilerBase;
//# sourceMappingURL=compilerBase.js.map