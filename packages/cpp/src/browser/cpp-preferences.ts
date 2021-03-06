/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { PreferenceSchema, PreferenceProxy, PreferenceService, createPreferenceProxy, PreferenceContribution } from '@theia/core/lib/browser/preferences';
import { interfaces } from 'inversify';
import { CppBuildConfiguration } from './cpp-build-configurations';

export const cppPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'cpp.buildConfigurations': {
            description: 'List of build configurations',
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    'name': {
                        type: 'string'
                    },
                    'directory': {
                        type: 'string'
                    },
                    'commands': {
                        type: 'object',
                        properties: {
                            'build': {
                                type: 'string',
                            }
                        },
                    }
                },
                required: ['name', 'directory'],
            },
            default: [
                {
                    name: '',
                    directory: ''
                }
            ],
        },
        'cpp.experimentalCommands': {
            description: 'Enable experimental commands mostly intended for Clangd developers.',
            default: false,
            type: 'boolean'
        },
        'cpp.trace.server': {
            type: 'string',
            enum: [
                'off',
                'messages',
                'verbose'
            ],
            default: 'off',
            description: 'Enable/disable tracing communications with the C/C++ language server'
        }
    }
};

export class CppConfiguration {
    'cpp.buildConfigurations': CppBuildConfiguration[];
    'cpp.experimentalCommands': boolean;
}

export const CppPreferences = Symbol('CppPreferences');
export type CppPreferences = PreferenceProxy<CppConfiguration>;

export function createCppPreferences(preferences: PreferenceService): CppPreferences {
    return createPreferenceProxy(preferences, cppPreferencesSchema);
}

export function bindCppPreferences(bind: interfaces.Bind): void {
    bind(CppPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createCppPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: cppPreferencesSchema });
}
