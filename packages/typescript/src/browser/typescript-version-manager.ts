/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import { Event, Emitter, Path } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { StorageService } from '@theia/core/lib/browser';
import { FileSystem, FileSystemError } from '@theia/filesystem/lib/common';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TypescriptPreferences } from './typescript-preferences';

export class TypescriptVersion {
    constructor(
        readonly uri: URI,
        protected readonly filesystem: FileSystem
    ) { }
    protected _version: string | undefined;
    get version(): string | undefined {
        return this._version;
    }
    get valid(): boolean {
        return !!this._version;
    }
    get path(): Path {
        return this.uri.path;
    }
    get packageUri(): URI {
        return this.uri.parent.resolve('package.json');
    }
    get tsServerPath(): Path {
        return this.path.join('tsserver.js');
    }
    equals(another: TypescriptVersion | undefined): boolean {
        return !!another && this.uri.toString() === another.uri.toString();
    }
    async resolve(): Promise<void> {
        try {
            const { content } = await this.filesystem.resolveContent(this.packageUri.toString());
            const pck: { version?: string | Object } | undefined = JSON.parse(content);
            if (!pck || !pck.version || typeof pck.version !== 'string') {
                this._version = undefined;
            } else {
                this._version = pck.version;
            }
        } catch (e) {
            if (!FileSystemError.FileNotFound.is(e) && !FileSystemError.FileIsDirectory.is(e)) {
                console.error('Failed to resolve a TS version for a URI: ' + this.uri.toString(), e);
            }
            this._version = undefined;
        }
    }
}

@injectable()
export class TypeScriptVersionManager {

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    @inject(FileSystemWatcher)
    protected readonly fsWatcher: FileSystemWatcher;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(TypescriptPreferences)
    protected readonly preferences: TypescriptPreferences;

    readonly defaultVersion = new TypescriptVersion(new URI(), this.filesystem);

    protected readonly onDidChangeCurrentEmitter = new Emitter<TypescriptVersion | undefined>();
    readonly onDidChangeCurrentVersion: Event<TypescriptVersion | undefined> = this.onDidChangeCurrentEmitter.event;

    @postConstruct()
    protected init(): void {
        this.updateWorkspaceVersions();
        this.workspace.onWorkspaceChanged(() => this.updateWorkspaceVersions());
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'typescript.tsdk') {
                this.updateWorkspaceVersions();
            }
        });
        this.fsWatcher.onFilesChanged(e => {
            for (const version of this._workspaceVersions) {
                if (FileChangeEvent.isAffected(e, version.uri)) {
                    version.resolve().then(() => this.updateCurrentVersion());
                }
            }
        });
        this.storage.getData<boolean>('typescript.useWorkspaceTsdk').then(value =>
            this._useWorkspaceTsds = value || false
        );
    }

    protected _currentVersion: TypescriptVersion = this.defaultVersion;
    get currentVersion(): TypescriptVersion {
        return this._currentVersion;
    }
    set currentVersion(currentVersion: TypescriptVersion) {
        this.setCurrentVersion(this.validateVersion(currentVersion));
    }
    protected setCurrentVersion(currentVersion: TypescriptVersion | undefined) {
        if (this._currentVersion && this._currentVersion.equals(currentVersion) || !currentVersion) {
            return;
        }
        this._currentVersion = currentVersion;
        this._useWorkspaceTsds = !this.defaultVersion.equals(currentVersion);
        this.storage.setData('typescript.useWorkspaceTsdk', this._useWorkspaceTsds);
        this.onDidChangeCurrentEmitter.fire(this._currentVersion);
    }

    protected _useWorkspaceTsds = false;
    get useWorkspaceTsdk(): boolean {
        return this._useWorkspaceTsds;
    }

    protected _workspaceVersions: TypescriptVersion[] = [];
    get workspaceVersions(): TypescriptVersion[] {
        return this._workspaceVersions.filter(version => version.valid);
    }

    validateVersion(version: TypescriptVersion): TypescriptVersion {
        if (version.equals(this.defaultVersion)) {
            return this.defaultVersion;
        }
        for (const workspaceVersion of this.workspaceVersions) {
            if (workspaceVersion.equals(version)) {
                return workspaceVersion;
            }
        }
        return this.defaultVersion;
    }

    protected async updateWorkspaceVersions(): Promise<void> {
        const all = new Map<string, TypescriptVersion>();
        await Promise.all([
            this.resolveVersions(all, this.preferences['typescript.tsdk']),
            this.resolveVersions(all, 'node_modules/typescript/lib')
        ]);
        this._workspaceVersions = [];
        for (const version of all.values()) {
            this._workspaceVersions.push(version);
        }
        this.updateCurrentVersion();
    }
    protected updateCurrentVersion(): void {
        this.currentVersion = this.currentVersion;
    }

    protected async resolveVersions(versions: Map<string, TypescriptVersion>, rawPath?: string): Promise<void> {
        if (!rawPath) {
            return;
        }
        const path = new Path(rawPath);
        if (path.isAbsolute) {
            await this.resolveVersion(versions, new URI().withPath(path));
        } else {
            await Promise.all(this.workspace.tryGetRoots().map(root =>
                this.resolveVersion(versions, new URI(root.uri).resolve(path))
            ));
        }
    }
    protected async resolveVersion(versions: Map<string, TypescriptVersion>, uri: URI): Promise<void> {
        const key = uri.toString();
        if (versions.has(key)) {
            return;
        }
        const version = new TypescriptVersion(uri, this.filesystem);
        versions.set(key, version);
        await version.resolve();
    }

}
