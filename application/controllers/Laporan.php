<?php
    
    defined('BASEPATH') OR exit('No direct script access allowed');
    
    class Laporan extends CI_Controller {
    
        public function __construct()
        {
            parent ::__construct();
            $this->load->model('Perhitungan_model');
        }

		public function cetak_laporan_hasil()
		{
			$data = [
				'hasil_saw'=> $this->Perhitungan_model->get_hasil_saw(),
				'hasil_topsis'=> $this->Perhitungan_model->get_hasil_topsis(),
				'hasil_wp' => $this->Perhitungan_model->get_hasil_wp()
			];
			
			$this->load->library('pdf');

			$this->pdf->setPaper('A4', 'potrait');
			$this->pdf->filename = "Laporan_Hasil.pdf";
			$this->pdf->load_view('laporan_hasil', $data);
		} 
    }
    