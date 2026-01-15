import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ApiServerConfigService {
    private static readonly STORAGE_KEY = 'api-server-url';

    getServerUrl(): string | null {
        return localStorage.getItem(ApiServerConfigService.STORAGE_KEY);
    }

    setServerUrl(url: string): void {
        localStorage.setItem(ApiServerConfigService.STORAGE_KEY, url);
    }

    hasServerUrl(): boolean {
        return !!this.getServerUrl();
    }

    clearServerUrl(): void {
        localStorage.removeItem(ApiServerConfigService.STORAGE_KEY);
    }
}
