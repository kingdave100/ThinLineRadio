/*
 * *****************************************************************************
 * Copyright (C) 2019-2024 Chrystian Huot <chrystian@huot.qc.ca>
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

import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ApiServerConfigService } from './services/api-server-config.service';
import { ApiServerDialogComponent } from './components/rdio-scanner/api-server-dialog/api-server-dialog.component';

@Component({
    standalone: false,
    selector: 'app-root',
    styleUrls: ['./app.component.scss'],
    templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
    constructor(
        private dialog: MatDialog,
        private apiServerConfig: ApiServerConfigService
    ) {}

    ngOnInit(): void {
        if (!this.apiServerConfig.hasServerUrl()) {
            const dialogRef = this.dialog.open(ApiServerDialogComponent, {
                disableClose: true,
                width: '500px'
            });

            dialogRef.afterClosed().subscribe(result => {
                if (result) {
                    this.apiServerConfig.setServerUrl(result);
                }
            });
        }
    }
}
