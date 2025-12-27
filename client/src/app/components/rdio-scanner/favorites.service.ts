/*
 * *****************************************************************************
 * Copyright (C) 2025 Thinline Dynamic Solutions
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

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SettingsService } from './settings/settings.service';
import { RdioScannerConfig, RdioScannerEvent } from './rdio-scanner';
import { RdioScannerService } from './rdio-scanner.service';

export interface FavoriteItem {
    type: 'system' | 'tag' | 'talkgroup';
    systemId?: number;
    tag?: string;
    talkgroupId?: number;
}

export interface FavoritesConfig {
    [key: string]: FavoriteItem; // key is like "system:1", "tag:system:1:Fire", "talkgroup:system:1:123"
}

@Injectable()
export class FavoritesService {
    private favorites$ = new BehaviorSubject<Set<string>>(new Set());
    private favorites: Set<string> = new Set();

    constructor(
        private settingsService: SettingsService,
        private rdioScannerService: RdioScannerService,
    ) {
        this.loadFavorites();
    }

    private getFavoriteKey(item: FavoriteItem): string {
        if (item.type === 'system' && item.systemId !== undefined) {
            return `system:${item.systemId}`;
        } else if (item.type === 'tag' && item.systemId !== undefined && item.tag) {
            return `tag:${item.systemId}:${item.tag}`;
        } else if (item.type === 'talkgroup' && item.systemId !== undefined && item.talkgroupId !== undefined) {
            return `talkgroup:${item.systemId}:${item.talkgroupId}`;
        }
        return '';
    }

    getFavorites(): Observable<Set<string>> {
        return this.favorites$.asObservable();
    }

    getAllFavorites(): Set<string> {
        return new Set(this.favorites);
    }

    isFavorite(item: FavoriteItem): boolean {
        const key = this.getFavoriteKey(item);
        return this.favorites.has(key);
    }

    isSystemFavorite(systemId: number): boolean {
        return this.isFavorite({ type: 'system', systemId });
    }

    isTagFavorite(systemId: number, tag: string): boolean {
        return this.isFavorite({ type: 'tag', systemId, tag });
    }

    isTalkgroupFavorite(systemId: number, talkgroupId: number): boolean {
        return this.isFavorite({ type: 'talkgroup', systemId, talkgroupId });
    }

    addFavorite(item: FavoriteItem): void {
        const key = this.getFavoriteKey(item);
        if (key && !this.favorites.has(key)) {
            this.favorites.add(key);
            this.favorites$.next(new Set(this.favorites));
            this.saveFavorites();
        }
    }

    addFavorites(items: FavoriteItem[]): void {
        let changed = false;
        items.forEach(item => {
            const key = this.getFavoriteKey(item);
            if (key && !this.favorites.has(key)) {
                this.favorites.add(key);
                changed = true;
            }
        });
        if (changed) {
            this.favorites$.next(new Set(this.favorites));
            this.saveFavorites();
        }
    }

    removeFavorite(item: FavoriteItem): void {
        const key = this.getFavoriteKey(item);
        if (this.favorites.has(key)) {
            this.favorites.delete(key);
            this.favorites$.next(new Set(this.favorites));
            this.saveFavorites();
        }
    }

    removeFavorites(items: FavoriteItem[]): void {
        let changed = false;
        items.forEach(item => {
            const key = this.getFavoriteKey(item);
            if (this.favorites.has(key)) {
                this.favorites.delete(key);
                changed = true;
            }
        });
        if (changed) {
            this.favorites$.next(new Set(this.favorites));
            this.saveFavorites();
        }
    }

    toggleFavorite(item: FavoriteItem): void {
        if (this.isFavorite(item)) {
            this.removeFavorite(item);
        } else {
            this.addFavorite(item);
        }
    }

    getFavoriteItems(): FavoriteItem[] {
        const items: FavoriteItem[] = [];
        this.favorites.forEach(key => {
            const parts = key.split(':');
            if (parts[0] === 'system' && parts.length === 2) {
                items.push({ type: 'system', systemId: parseInt(parts[1]) });
            } else if (parts[0] === 'tag' && parts.length === 3) {
                items.push({ type: 'tag', systemId: parseInt(parts[1]), tag: parts[2] });
            } else if (parts[0] === 'talkgroup' && parts.length === 3) {
                items.push({ type: 'talkgroup', systemId: parseInt(parts[1]), talkgroupId: parseInt(parts[2]) });
            }
        });
        return items;
    }

    private loadFavorites(): void {
        try {
            // Load from localStorage
            const stored = localStorage.getItem('rdio-scanner-favorites');
            if (stored) {
                const favoritesList = JSON.parse(stored) as FavoriteItem[];
                this.favorites = new Set(favoritesList.map(f => this.getFavoriteKey(f)));
            } else {
                this.favorites = new Set();
            }
            this.favorites$.next(new Set(this.favorites));
        } catch (error) {
            console.error('[FavoritesService] Error loading favorites from localStorage:', error);
            this.favorites = new Set();
            this.favorites$.next(new Set(this.favorites));
        }
    }

    private saveFavorites(): void {
        const favoriteItems = this.getFavoriteItems();

        try {
            // Save to localStorage
            localStorage.setItem('rdio-scanner-favorites', JSON.stringify(favoriteItems));
        } catch (error) {
            console.error('[FavoritesService] Error saving favorites to localStorage:', error);
        }
    }
}

