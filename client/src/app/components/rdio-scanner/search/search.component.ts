/*
 * *****************************************************************************
 * Copyright (C) 2019-2022 Chrystian Huot <chrystian.huot@saubeo.solutions>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 * ****************************************************************************
 */

import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatDatepicker } from '@angular/material/datepicker';
import { MatPaginator } from '@angular/material/paginator';
import { BehaviorSubject } from 'rxjs';
import {
    RdioScannerCall,
    RdioScannerConfig,
    RdioScannerEvent,
    RdioScannerLivefeedMode,
    RdioScannerPlaybackList,
    RdioScannerSearchOptions,
    RdioScannerSystem,
    RdioScannerTalkgroup,
} from '../rdio-scanner';
import { RdioScannerService } from '../rdio-scanner.service';
import { FavoritesService } from '../favorites.service';

@Component({
    standalone: false,
    selector: 'rdio-scanner-search',
    styleUrls: ['./search.component.scss'],
    templateUrl: './search.component.html',
})
export class RdioScannerSearchComponent implements OnInit, AfterViewInit, OnDestroy {
    call: RdioScannerCall | undefined;
    callPending: number | undefined;

    form: any;

    livefeedOnline = false;
    livefeedPlayback = false;

    playbackList: RdioScannerPlaybackList | undefined;

    optionsGroup: string[] = [];
    optionsSystem: string[] = [];
    optionsTag: string[] = [];
    optionsTalkgroup: string[] = [];
    optionsFavorites: Array<{systemId: number, talkgroupId: number, label: string}> = [];

    paused = false;

    results = new BehaviorSubject(new Array<RdioScannerCall | null>(10));
    resultsPending = false;

    time12h = false;

    private config: RdioScannerConfig | undefined;
    private eventSubscription: any;

    @ViewChild(MatPaginator, { read: MatPaginator }) private paginator: MatPaginator | undefined;
    @ViewChild('datePicker') private datePicker: MatDatepicker<Date> | undefined;

    selectedDate: Date | null = null;
    showFavoritesOnly = false;

    constructor(
        private rdioScannerService: RdioScannerService,
        private ngChangeDetectorRef: ChangeDetectorRef,
        private ngFormBuilder: FormBuilder,
        private favoritesService: FavoritesService,
    ) {
        this.form = this.ngFormBuilder.group({
            date: [null],
            group: [-1],
            sort: [-1],
            system: [-1],
            tag: [-1],
            talkgroup: [-1],
            favorite: [-1],
        });

        this.eventSubscription = this.rdioScannerService.event.subscribe((event: RdioScannerEvent) => this.eventHandler(event));
    }

    ngOnInit(): void {
        const currentConfig = this.rdioScannerService.getConfig();
        if (currentConfig) {
            this.config = currentConfig;
            this.initializeOptions();
            this.ngChangeDetectorRef.detectChanges();
        }
    }

    ngAfterViewInit(): void {
        setTimeout(() => {
            if (this.config) {
                this.searchCalls();
            }
        }, 0);
    }

    ngOnDestroy(): void {
        this.eventSubscription.unsubscribe();

        if (this.livefeedPlayback) {
            this.rdioScannerService.stopPlaybackMode();
        }
    }

    download(id: number): void {
        this.rdioScannerService.loadAndDownload(id);
    }

    formChangeHandler(): void {
        if (this.livefeedPlayback) {
            this.rdioScannerService.stopPlaybackMode();
        }

        if (this.resultsPending) {
            return;
        }

        this.paginator?.firstPage();
        this.playbackList = undefined;
        this.refreshFilters();
        this.searchCalls();
    }

    play(id: number): void {
        this.rdioScannerService.loadAndPlay(id);
    }

    refreshFilters(): void {
        if (!this.config) {
            return;
        }

        const selectedGroup = this.getSelectedGroup();
        const selectedSystem = this.getSelectedSystem();
        const selectedTag = this.getSelectedTag();
        const selectedTalkgroup = this.getSelectedTalkgroup();

        this.optionsSystem = this.config.systems
            .filter((system) => {
                const group = selectedGroup === undefined ||
                    system.talkgroups.some((talkgroup) => talkgroup.groups.includes(selectedGroup));
                const tag = selectedTag === undefined ||
                    system.talkgroups.some((talkgroup) => talkgroup.tag === selectedTag);
                return group && tag;
            })
            .map((system) => system.label);

        this.optionsTalkgroup = selectedSystem == undefined
            ? []
            : selectedSystem.talkgroups
                .filter((talkgroup) => {
                    const group = selectedGroup == undefined ||
                        talkgroup.groups.includes(selectedGroup);
                    const tag = selectedTag == undefined ||
                        talkgroup.tag === selectedTag;
                    return group && tag;
                })
                .map((talkgroup) => talkgroup.label);

        this.optionsGroup = Object.keys(this.config.groups)
            .filter((group) => {
                const system: boolean = selectedSystem === undefined ||
                    selectedSystem.talkgroups.some((talkgroup) => talkgroup.groups.includes(group))
                const talkgroup: boolean = selectedTalkgroup === undefined ||
                    selectedTalkgroup.groups.includes(group);
                const tag: boolean = selectedTag === undefined ||
                    (selectedTalkgroup !== undefined && selectedTalkgroup.tag === selectedTag) ||
                    (this.config !== undefined && this.config.systems
                        .flatMap((system) => system.talkgroups)
                        .some((talkgroup) => talkgroup.groups.includes(group) && talkgroup.tag === selectedTag))
                return system && talkgroup && tag;
            })
            .sort((a, b) => a.localeCompare(b))

        this.optionsTag = Object.keys(this.config.tags)
            .filter((tag) => {
                const system: boolean = selectedSystem === undefined ||
                    selectedSystem.talkgroups.some((talkgroup) => talkgroup.tag === tag)
                const talkgroup: boolean = selectedTalkgroup === undefined ||
                    selectedTalkgroup.tag === tag;
                const group: boolean = selectedGroup === undefined ||
                    (selectedTalkgroup !== undefined && selectedTalkgroup.groups.includes(selectedGroup)) ||
                    (this.config !== undefined && this.config.systems
                        .flatMap((system) => system.talkgroups)
                        .some((talkgroup) => talkgroup.tag === tag && talkgroup.groups.includes(selectedGroup)))
                return system && talkgroup && group;
            })
            .sort((a, b) => a.localeCompare(b))

        this.form.patchValue({
            group: selectedGroup ? this.optionsGroup.findIndex((group) => group === selectedGroup) : -1,
            system: selectedSystem ? this.optionsSystem.findIndex((system) => system === selectedSystem.label) : -1,
            tag: selectedTag ? this.optionsTag.findIndex((tag) => tag === selectedTag) : -1,
            talkgroup: selectedTalkgroup ? this.optionsTalkgroup.findIndex((talkgroup) => talkgroup === selectedTalkgroup.label) : -1,
        }, { emitEvent: false });
    }

    refreshResults(): void {
        if (!this.paginator) {
            return;
        }

        console.log('[Pagination] Current page:', this.paginator.pageIndex, 'Total count:', this.playbackList?.count);
        this.searchCalls();
    }

    resetForm(): void {
        this.form.reset({
            date: null,
            group: -1,
            sort: -1,
            system: -1,
            tag: -1,
            talkgroup: -1,
            favorite: -1,
        });

        this.selectedDate = null;
        this.showFavoritesOnly = false;
        this.paginator?.firstPage();

        this.formChangeHandler();
    }

    setFavorite(value: number): void {
        this.form.get('favorite')?.setValue(value, { emitEvent: false });
        this.formChangeHandler();
    }

    getSelectedFavoriteLabel(): string {
        const index = this.form.value.favorite;
        if (index == null || index < 0) return 'All Calls';
        return this.optionsFavorites[index]?.label || 'All Calls';
    }

    openDatePicker(): void {
        this.datePicker?.open();
    }

    onDateSelected(event: any): void {
        const date = event?.value;
        if (date && date instanceof Date) {
            this.selectedDate = date;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;
            this.form.get('date')?.setValue(dateString, { emitEvent: false });
            this.formChangeHandler();
        } else if (date === null) {
            this.clearDate();
        }
    }

    clearDate(): void {
        this.selectedDate = null;
        this.form.get('date')?.setValue(null, { emitEvent: false });
        this.formChangeHandler();
    }

    setSort(value: number): void {
        this.form.get('sort')?.setValue(value, { emitEvent: false });
        this.formChangeHandler();
    }

    setSystem(value: number): void {
        this.form.get('system')?.setValue(value, { emitEvent: false });
        this.formChangeHandler();
    }

    setTalkgroup(value: number): void {
        this.form.get('talkgroup')?.setValue(value, { emitEvent: false });
        this.formChangeHandler();
    }

    setGroup(value: number): void {
        this.form.get('group')?.setValue(value, { emitEvent: false });
        this.formChangeHandler();
    }

    setTag(value: number): void {
        this.form.get('tag')?.setValue(value, { emitEvent: false });
        this.formChangeHandler();
    }

    getSelectedSystemLabel(): string {
        const index = this.form.value.system;
        if (index == null || index < 0) return 'All Systems';
        return this.optionsSystem[index] || 'All Systems';
    }

    getSelectedTalkgroupLabel(): string {
        const index = this.form.value.talkgroup;
        if (index == null || index < 0) return 'All Talkgroups';
        return this.optionsTalkgroup[index] || 'All Talkgroups';
    }

    getSelectedGroupLabel(): string {
        const index = this.form.value.group;
        if (index == null || index < 0) return 'All Groups';
        return this.optionsGroup[index] || 'All Groups';
    }

    getSelectedTagLabel(): string {
        const index = this.form.value.tag;
        if (index == null || index < 0) return 'All Tags';
        return this.optionsTag[index] || 'All Tags';
    }

    getActiveFiltersCount(): number {
        let count = 0;

        if (this.selectedDate) count++;
        if (this.form.value.system >= 0) count++;
        if (this.form.value.talkgroup >= 0) count++;
        if (this.form.value.group >= 0) count++;
        if (this.form.value.tag >= 0) count++;
        if (this.form.value.favorite >= 0) count++;
        if (this.showFavoritesOnly) count++;

        return count;
    }

    toggleFavoritesOnly(): void {
        this.showFavoritesOnly = !this.showFavoritesOnly;
        this.formChangeHandler();
    }

    searchCalls(): void {
        if (this.resultsPending || this.livefeedPlayback) {
            return;
        }

        const pageIndex = this.paginator?.pageIndex || 0;
        const pageSize = this.paginator?.pageSize || 10;

        console.log('[Search] pageIndex:', pageIndex, 'pageSize:', pageSize);

        const options: RdioScannerSearchOptions = {
            limit: pageSize,
            offset: pageIndex * pageSize,
            sort: this.form.value.sort,
        };

        console.log('[Search] Fetching with offset:', options.offset, 'limit:', options.limit);

        if (this.selectedDate) {
            options.date = this.selectedDate.toISOString() as any;
        }

        if ((this.form.value.group ?? -1) >= 0) {
            const group = this.getSelectedGroup();
            if (group) {
                options.group = group;
            }
        }

        if ((this.form.value.system ?? -1) >= 0) {
            const system = this.getSelectedSystem();
            if (system) {
                options.system = system.id;
            }
        }

        if ((this.form.value.tag ?? -1) >= 0) {
            const tag = this.getSelectedTag();
            if (tag) {
                options.tag = tag;
            }
        }

        if ((this.form.value.talkgroup ?? -1) >= 0) {
            const talkgroup = this.getSelectedTalkgroup();
            if (talkgroup) {
                options.talkgroup = talkgroup.id;
            }
        }

        if ((this.form.value.favorite ?? -1) >= 0) {
            const favorite = this.optionsFavorites[this.form.value.favorite];
            if (favorite) {
                options.system = favorite.systemId;
                options.talkgroup = favorite.talkgroupId;
            }
        }

        const sent = this.rdioScannerService.searchCalls(options);

        if (sent) {
            this.resultsPending = true;
            this.form.disable();
        }
    }

    stop(): void {
        if (this.livefeedPlayback) {
            this.rdioScannerService.stopPlaybackMode();
        } else {
            this.rdioScannerService.stop();
        }
    }

    private eventHandler(event: RdioScannerEvent): void {
        if ('call' in event) {
            this.call = event.call;

            if (this.callPending) {
                const index = this.results.value.findIndex((call) => call?.id === this.callPending);

                if (index === -1) {
                    if (this.form.value.sort === -1) {
                        this.paginator?.previousPage();
                    } else {
                        this.paginator?.nextPage();
                    }
                }

                this.callPending = undefined;
            }
        }

        if ('config' in event) {
            this.config = event.config;
            this.callPending = undefined;
            this.initializeOptions();

            if (!this.playbackList && !this.resultsPending) {
                setTimeout(() => this.searchCalls(), 100);
            }
        }

        if ('livefeedMode' in event) {
            this.livefeedOnline = event.livefeedMode === RdioScannerLivefeedMode.Online;
            this.livefeedPlayback = event.livefeedMode === RdioScannerLivefeedMode.Playback;
        }

        if ('playbackList' in event) {
            this.playbackList = event.playbackList;
            console.log('[Search] Received playbackList - count:', this.playbackList?.count, 'hasMore:', this.playbackList?.hasMore, 'results:', this.playbackList?.results.length, 'options:', this.playbackList?.options);

            if (this.playbackList && this.playbackList.results) {
                let results = this.playbackList.results;

                if (this.showFavoritesOnly && this.optionsFavorites.length > 0) {
                    const favoriteSet = new Set(
                        this.optionsFavorites.map(fav => `${fav.systemId}-${fav.talkgroupId}`)
                    );

                    results = results.filter(call => {
                        const key = `${call.system}-${call.talkgroup}`;
                        return favoriteSet.has(key);
                    });
                }

                const calls: Array<RdioScannerCall | null> = [...results];

                while (calls.length < 10) {
                    calls.push(null);
                }

                this.results.next(calls);

                // Fix pagination count: backend returns page size in count, not total
                // If hasMore is true, set count high enough to enable next page
                if (this.playbackList.hasMore) {
                    const pageIndex = this.paginator?.pageIndex || 0;
                    const pageSize = this.paginator?.pageSize || 10;
                    // Set count to current page + at least 2 more pages to show pagination
                    this.playbackList.count = (pageIndex + 3) * pageSize;
                } else {
                    // No more results - set count to exactly what we've loaded
                    const pageIndex = this.paginator?.pageIndex || 0;
                    const pageSize = this.paginator?.pageSize || 10;
                    this.playbackList.count = (pageIndex * pageSize) + results.length;
                }
                console.log('[Search] Adjusted count for pagination:', this.playbackList.count);
            }

            this.resultsPending = false;
            this.form.enable();
        }

        if ('playbackPending' in event) {
            this.callPending = event.playbackPending;
        }

        if ('pause' in event) {
            this.paused = event.pause || false;
        }

        this.ngChangeDetectorRef.detectChanges();
    }

    private initializeOptions(): void {
        if (!this.config) {
            return;
        }

        this.optionsGroup = Object.keys(this.config.groups || []).sort((a, b) => a.localeCompare(b));
        this.optionsSystem = (this.config.systems || []).map((system) => system.label);
        this.optionsTag = Object.keys(this.config.tags || []).sort((a, b) => a.localeCompare(b));
        this.loadFavorites();
        this.time12h = this.config.time12hFormat || false;
    }

    private loadFavorites(): void {
        if (!this.config) {
            this.optionsFavorites = [];
            return;
        }

        const favoriteItems = this.favoritesService.getFavoriteItems();
        this.optionsFavorites = [];

        favoriteItems.forEach(item => {
            if (item.type === 'talkgroup' && item.systemId !== undefined && item.talkgroupId !== undefined) {
                const system = this.config?.systems.find(s => s.id === item.systemId);
                if (system) {
                    const talkgroup = system.talkgroups.find(t => t.id === item.talkgroupId);
                    if (talkgroup) {
                        this.optionsFavorites.push({
                            systemId: item.systemId,
                            talkgroupId: item.talkgroupId,
                            label: `${system.label} - ${talkgroup.label}`
                        });
                    }
                }
            }
        });

        this.optionsFavorites.sort((a, b) => a.label.localeCompare(b.label));
    }

    private getSelectedGroup(): string | undefined {
        const groupIndex = this.form.value.group;
        return groupIndex != null && groupIndex >= 0 ? this.optionsGroup[groupIndex] : undefined;
    }

    private getSelectedSystem(): RdioScannerSystem | undefined {
        const systemIndex = this.form.value.system;
        if (systemIndex == null || systemIndex < 0) return undefined;
        return this.config?.systems.find((system) => system.label === this.optionsSystem[systemIndex]);
    }

    private getSelectedTag(): string | undefined {
        const tagIndex = this.form.value.tag;
        return tagIndex != null && tagIndex >= 0 ? this.optionsTag[tagIndex] : undefined;
    }

    private getSelectedTalkgroup(): RdioScannerTalkgroup | undefined {
        const system = this.getSelectedSystem();
        if (!system) return undefined;
        const talkgroupIndex = this.form.value.talkgroup;
        if (talkgroupIndex == null || talkgroupIndex < 0) return undefined;
        return system.talkgroups.find((talkgroup) => talkgroup.label === this.optionsTalkgroup[talkgroupIndex]);
    }
}
